import * as React from "react";
import * as R from "remeda";
import { useAutoRerender } from "~/hooks/useAutoRerender";
import { useHydrated } from "~/hooks/useHydrated";
import {
	BROADCAST_HEARTBEAT_INTERVAL_MS,
	BROADCAST_STATE_VERSION,
} from "./broadcast-constants";
import type {
	BroadcastAudioFeed,
	BroadcastState,
	BroadcastStreamMessage,
} from "./broadcast-types";
import * as ClipTransfer from "./core/ClipTransfer";

// a connection dropped while the machine was suspended or the network changed raises no error of its own
const SILENT_CONNECTION_TIMEOUT_MS = BROADCAST_HEARTBEAT_INTERVAL_MS * 2.5;
const LIVENESS_CHECK_INTERVAL_MS = 2_000;
const REOPEN_BASE_DELAY_MS = 1_000;
const REOPEN_MAX_DELAY_MS = 5_000;

/** How the stream of {@link useBroadcastStream} is doing. */
export type BroadcastConnection =
	/** As the page loads, before the stream's first message. */
	| { status: "connecting" }
	| { status: "connected" }
	| {
			status: "lost";
			/** The server said it is restarting, e.g. for a deploy, rather than the connection dropping. */
			isRestarting: boolean;
			/** When the server was last heard from (epoch ms of this clock). */
			lastHeardAt: number;
	  };

/**
 * Latest state of the broadcast pushed over its stream, starting from the loader's. The last state is
 * kept while disconnected and the stream is reopened with backoff, the server sends a fresh state on reconnect.
 * States of another version than this code's (see `BROADCAST_STATE_VERSION`) are not shown, the last one of its own
 * staying instead and `isOutdated` telling it apart. Also how far ahead the server's clock is of this one's
 * (`clockOffsetMs`), to time the scenes by.
 */
export function useBroadcastStream<
	Initial extends BroadcastState | null,
	State extends BroadcastState = NonNullable<Initial>,
>({
	url,
	initialState,
	onMessage,
}: {
	url: string;
	/** `null` while there is none yet, e.g. an OBS URL not pointed at a broadcast. */
	initialState: Initial;
	/** Gets the messages other than heartbeats, reconnects and restarts, the states shown too, e.g. for clip signaling. */
	onMessage?: (message: BroadcastStreamMessage<State>) => void;
}) {
	const [state, setState] = React.useState<State | Initial>(initialState);
	const [connection, setConnection] = React.useState<BroadcastConnection>({
		status: "connecting",
	});
	const [isOutdated, setIsOutdated] = React.useState(false);
	const [clockOffsetMs, setClockOffsetMs] = React.useState(0);
	const onMessageRef = React.useRef(onMessage);
	React.useLayoutEffect(() => {
		onMessageRef.current = onMessage;
	});

	React.useEffect(() => {
		let source: EventSource | null = null;
		let reopenTimeout: ReturnType<typeof setTimeout> | undefined;
		let failedReopens = 0;
		let lastMessageAt = Date.now();
		// when the current connection was opened or last heard from, what tells a silently dead one
		let aliveAt = Date.now();
		let isConnected = false;
		let isLost = false;
		let isRestarting = false;

		const lose = () => {
			if (isLost) return;
			isLost = true;
			isConnected = false;
			setConnection({
				status: "lost",
				isRestarting,
				lastHeardAt: lastMessageAt,
			});
		};

		const open = () => {
			aliveAt = Date.now();
			source = new EventSource(url);
			source.onmessage = (event) => {
				lastMessageAt = Date.now();
				aliveAt = lastMessageAt;
				failedReopens = 0;

				const message = JSON.parse(event.data) as BroadcastStreamMessage<State>;
				if (message.kind === "restart") {
					isRestarting = true;
					lose();
					reopen();
					return;
				}
				if (!isConnected) {
					isConnected = true;
					isLost = false;
					isRestarting = false;
					setConnection({ status: "connected" });
				}
				if (message.kind === "reconnect") {
					reopen();
					return;
				}
				// a state of another version, the server's code being newer, isn't this code's to show
				if (
					message.kind === "state" &&
					message.state.v !== BROADCAST_STATE_VERSION
				) {
					return;
				}
				if (message.kind === "state") setState(message.state);
				if (message.kind !== "heartbeat") onMessageRef.current?.(message);
				if (message.kind === "hello") {
					setClockOffsetMs(message.now - Date.now());
					setIsOutdated(message.v !== BROADCAST_STATE_VERSION);
				}
			};
			source.onerror = () => {
				lose();
				// CLOSED means the browser gave up reconnecting on its own, e.g. after a non-200 response
				if (source?.readyState === EventSource.CLOSED) reopen();
			};
		};

		const reopen = () => {
			source?.close();
			source = null;
			clearTimeout(reopenTimeout);
			reopenTimeout = setTimeout(open, reopenDelay(failedReopens));
			failedReopens++;
		};

		const reopenNow = () => {
			if (isConnected) return;

			source?.close();
			clearTimeout(reopenTimeout);
			failedReopens = 0;
			open();
		};

		const livenessCheck = setInterval(() => {
			if (!source || Date.now() - aliveAt < SILENT_CONNECTION_TIMEOUT_MS) {
				return;
			}

			lose();
			reopen();
		}, LIVENESS_CHECK_INTERVAL_MS);

		open();
		window.addEventListener("online", reopenNow);

		return () => {
			clearInterval(livenessCheck);
			clearTimeout(reopenTimeout);
			window.removeEventListener("online", reopenNow);
			source?.close();
		};
	}, [url]);

	return {
		state,
		connection,
		isConnected: connection.status === "connected",
		isOutdated,
		clockOffsetMs,
	};
}

/** Backoff of reopening the stream, jittered so a server coming back isn't hit by every client at once. */
function reopenDelay(failedReopens: number) {
	const delay = Math.min(
		REOPEN_BASE_DELAY_MS * 2 ** failedReopens,
		REOPEN_MAX_DELAY_MS,
	);

	return delay / 2 + Math.random() * (delay / 2);
}

/** The server's clock (epoch ms) ticking every second, `null` until hydrated as the server rendered another time. */
export function useServerNow(clockOffsetMs: number) {
	const tick = useAutoRerender("second");
	const isHydrated = useHydrated();

	return isHydrated ? tick.getTime() + clockOffsetMs : null;
}

/** Sends the clips to the broadcast's overlays, see `ClipTransfer.createSender`. Pass `onMessage` to `useBroadcastStream`. */
export function useClipSender({
	signalUrl,
	clips,
	onFeeds,
}: {
	signalUrl: string;
	/** Changing them keeps the connections, the overlays get the new ones and drop the ones left out. */
	clips: ReadonlyArray<ClipTransfer.ClipSource>;
	/** Gets the audio feeds an overlay reports, `null` once it's gone. */
	onFeeds?: (peerId: string, feeds: BroadcastAudioFeed[] | null) => void;
}) {
	const [statuses, setStatuses] = React.useState<ClipTransfer.ClipPeerStatus[]>(
		[],
	);
	const senderRef = React.useRef<ClipTransfer.ClipSender | null>(null);
	const onFeedsRef = React.useRef(onFeeds);
	const clipsRef = React.useRef(clips);
	React.useLayoutEffect(() => {
		onFeedsRef.current = onFeeds;
		clipsRef.current = clips;
	});

	React.useEffect(() => {
		const sender = ClipTransfer.createSender({
			signalUrl,
			clips: clipsRef.current,
			onChange: setStatuses,
			onFeeds: (peerId, feeds) => onFeedsRef.current?.(peerId, feeds),
		});
		senderRef.current = sender;

		return () => {
			sender.close();
			senderRef.current = null;
		};
	}, [signalUrl]);

	const clipIds = clips.map((clip) => clip.id).join(",");
	// the ids say when the clips changed, a new array of the same clips doesn't
	React.useEffect(() => {
		senderRef.current?.setClips(clipsRef.current);
	}, [clipIds]);

	const onMessage = (message: BroadcastStreamMessage) =>
		senderRef.current?.handleMessage(message);

	return { statuses, onMessage };
}

const NO_CLIPS: ClipTransfer.ReceivedClips = {
	clip: new Map(),
	music: new Map(),
};

/**
 * Object URLs of the clips received from the dashboard by kind and clip id, see `ClipTransfer.createReceiver`. Pass
 * `onMessage` to `useBroadcastStream`.
 */
export function useClipReceiver({
	cache,
}: {
	/** Kept the same between renders. */
	cache?: ClipTransfer.ClipCache;
} = {}) {
	const [clips, setClips] =
		React.useState<ClipTransfer.ReceivedClips>(NO_CLIPS);
	const receiverRef = React.useRef<ClipTransfer.ClipReceiver | null>(null);

	React.useEffect(() => {
		const receiver = ClipTransfer.createReceiver({
			onChange: setClips,
			cache,
		});
		receiverRef.current = receiver;

		return () => {
			receiver.close();
			receiverRef.current = null;
			setClips(NO_CLIPS);
		};
	}, [cache]);

	const onMessage = (message: BroadcastStreamMessage) =>
		receiverRef.current?.handleMessage(message);
	const sendFeeds = (feeds: BroadcastAudioFeed[]) =>
		receiverRef.current?.sendFeeds(feeds);

	return { clips, onMessage, sendFeeds };
}

const FIT_TEXT_STEP_PX = 2;
// client sizes are rounded, which alone can make the scroll size a pixel larger
const OVERFLOW_TOLERANCE_PX = 1;

/**
 * Shrinks the element's font size from its styled size, down to `minScale` of it, until the text fits the
 * element: within its `-webkit-line-clamp` lines (one without) and not overflowing it sideways.
 */
export function useFitText<T extends HTMLElement>({
	text,
	minScale = 0.6,
}: {
	text: string;
	minScale?: number;
}) {
	const ref = React.useRef<T>(null);

	React.useLayoutEffect(() => {
		const element = ref.current;
		if (!element) return;

		let isCancelled = false;
		const fit = () => {
			if (isCancelled) return;

			element.style.fontSize = "";
			const styledSize = Number.parseFloat(getComputedStyle(element).fontSize);
			for (
				let size = styledSize - FIT_TEXT_STEP_PX;
				size >= styledSize * minScale && !fits(element);
				size -= FIT_TEXT_STEP_PX
			) {
				element.style.fontSize = `${size}px`;
			}
		};

		fit();
		// the text is measured again with the real font once it has loaded
		document.fonts.ready.then(fit);
		document.fonts.addEventListener("loadingdone", fit);

		return () => {
			isCancelled = true;
			document.fonts.removeEventListener("loadingdone", fit);
		};
	}, [text, minScale]);

	return ref;
}

function fits(element: HTMLElement) {
	const style = getComputedStyle(element);
	const maxLines =
		Number.parseInt(style.getPropertyValue("-webkit-line-clamp"), 10) || 1;
	const lineHeight = Number.parseFloat(style.lineHeight);

	element.style.setProperty("-webkit-line-clamp", "none");
	const lines = element.offsetHeight / lineHeight;
	element.style.removeProperty("-webkit-line-clamp");

	return (
		!(Math.round(lines) > maxLines) &&
		element.scrollWidth - element.clientWidth <= OVERFLOW_TOLERANCE_PX
	);
}

// an element with little in it filling the whole viewport would be huge
const MAX_OVERVIEW_SCALE = 1.5;
const ZOOM_FACTOR = 1.4;
// the zoom goes at least this far in, so an overview shrunk to fit a lot gets readable
const MIN_ZOOM_SCALE = 1.35;

/**
 * Frames the element in its parent like a camera: an overview scaled to fill the parent within its padding, then
 * zoomed in on the `zoomTarget` elements inside it (as far in as they all still fit within the padding), centering
 * them in the parent's whole box as far as the `zoomedOut` element stays above the view and no empty space shows
 * past the element's edges (an element smaller than the box is centered as a whole). Without a target the overview stays put. Sets the `--camera-overview` and `--camera-zoom`
 * transforms on the element for its animation between them. Framed again whenever `content` changes.
 */
export function useCamera<T extends HTMLElement>({
	content,
	zoomTarget,
	zoomedOut,
}: {
	content: unknown;
	/** Selector of the element zoomed to. */
	zoomTarget: string;
	/** Selector of an element at the top only shown in the overview, e.g. a header. */
	zoomedOut?: string;
}) {
	const ref = React.useRef<T>(null);

	React.useLayoutEffect(() => {
		const element = ref.current;
		const parent = element?.parentElement;
		if (!element || !parent) return;

		let isCancelled = false;
		const frame = () => {
			if (isCancelled) return;

			const style = getComputedStyle(parent);
			const padding = {
				top: Number.parseFloat(style.paddingTop),
				right: Number.parseFloat(style.paddingRight),
				bottom: Number.parseFloat(style.paddingBottom),
				left: Number.parseFloat(style.paddingLeft),
			};
			const contentBox = {
				x: padding.left,
				y: padding.top,
				width: parent.clientWidth - padding.left - padding.right,
				height: parent.clientHeight - padding.top - padding.bottom,
			};
			const size = { width: element.offsetWidth, height: element.offsetHeight };
			const overviewScale = Math.min(
				MAX_OVERVIEW_SCALE,
				contentBox.width / size.width,
				contentBox.height / size.height,
			);
			const overview = cameraTransform({
				box: contentBox,
				size,
				scale: overviewScale,
				center: { x: size.width / 2, y: size.height / 2 },
			});

			const targets = Array.from(
				element.querySelectorAll<HTMLElement>(zoomTarget),
			);
			const hidden = zoomedOut
				? element.querySelector<HTMLElement>(zoomedOut)
				: null;
			const targetBounds =
				targets.length > 0 ? boundsWithin(targets, element) : null;
			const zoom = targetBounds
				? cameraTransform({
						box: {
							x: 0,
							y: 0,
							width: parent.clientWidth,
							height: parent.clientHeight,
						},
						size,
						scale: Math.max(
							overviewScale,
							Math.min(
								Math.max(MIN_ZOOM_SCALE, overviewScale * ZOOM_FACTOR),
								contentBox.width / targetBounds.width,
								contentBox.height / targetBounds.height,
							),
						),
						center: {
							x: targetBounds.x + targetBounds.width / 2,
							y: targetBounds.y + targetBounds.height / 2,
						},
						hiddenAbove: hidden ? hidden.offsetTop + hidden.offsetHeight : 0,
					})
				: overview;

			element.style.setProperty("--camera-overview", overview);
			element.style.setProperty("--camera-zoom", zoom);
		};

		frame();
		// measured again with the real font once it has loaded
		document.fonts.ready.then(frame);
		document.fonts.addEventListener("loadingdone", frame);

		return () => {
			isCancelled = true;
			document.fonts.removeEventListener("loadingdone", frame);
		};
	}, [content, zoomTarget, zoomedOut]);

	return ref;
}

/**
 * Transform (origin top left) showing the element at the scale with its point `center` in the middle of the box,
 * its part above `hiddenAbove` kept out of the box. Along an axis the rest of the element fits in, it is centered
 * instead, along one it doesn't, moved no further than its edge reaches the box's.
 */
function cameraTransform({
	box,
	size,
	scale,
	center,
	hiddenAbove = 0,
}: {
	box: { x: number; y: number; width: number; height: number };
	size: { width: number; height: number };
	scale: number;
	center: { x: number; y: number };
	hiddenAbove?: number;
}) {
	const x = cameraOffset({
		boxStart: box.x,
		boxLength: box.width,
		shownStart: 0,
		shownEnd: size.width,
		center: center.x,
		scale,
	});
	const y = cameraOffset({
		boxStart: box.y,
		boxLength: box.height,
		shownStart: hiddenAbove,
		shownEnd: size.height,
		center: center.y,
		scale,
	});

	return `translate(${x}px, ${y}px) scale(${scale})`;
}

/** Offset along one axis of the element's part from `shownStart` to `shownEnd`, see {@link cameraTransform}. */
function cameraOffset({
	boxStart,
	boxLength,
	shownStart,
	shownEnd,
	center,
	scale,
}: {
	boxStart: number;
	boxLength: number;
	shownStart: number;
	shownEnd: number;
	center: number;
	scale: number;
}) {
	const shownLength = (shownEnd - shownStart) * scale;
	if (shownLength <= boxLength) {
		return boxStart + (boxLength - shownLength) / 2 - shownStart * scale;
	}

	return R.clamp(boxStart + boxLength / 2 - center * scale, {
		min: boxStart + boxLength - shownEnd * scale,
		max: boxStart - shownStart * scale,
	});
}

/** Box around the elements in the coordinates of their ancestor's layout box, transforms not counted. */
function boundsWithin(elements: HTMLElement[], ancestor: HTMLElement) {
	const boxes = elements.map((element) => {
		const position = offsetWithin(element, ancestor);

		return {
			left: position.x,
			top: position.y,
			right: position.x + element.offsetWidth,
			bottom: position.y + element.offsetHeight,
		};
	});
	const left = Math.min(...boxes.map((box) => box.left));
	const top = Math.min(...boxes.map((box) => box.top));

	return {
		x: left,
		y: top,
		width: Math.max(...boxes.map((box) => box.right)) - left,
		height: Math.max(...boxes.map((box) => box.bottom)) - top,
	};
}

function offsetWithin(element: HTMLElement, ancestor: HTMLElement) {
	let x = 0;
	let y = 0;
	let node: HTMLElement | null = element;
	while (node && node !== ancestor) {
		x += node.offsetLeft;
		y += node.offsetTop;
		node = node.offsetParent as HTMLElement | null;
	}

	return { x, y };
}
