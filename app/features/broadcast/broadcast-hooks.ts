import * as React from "react";
import { HEARTBEAT_INTERVAL_MS } from "~/features/events/events-types";
import type { BroadcastState, BroadcastStreamMessage } from "./broadcast-types";
import * as ClipTransfer from "./core/ClipTransfer";

// a connection dropped while the machine was suspended raises no error of its own
const SILENT_CONNECTION_TIMEOUT_MS = HEARTBEAT_INTERVAL_MS * 2 + 15_000;
const LIVENESS_CHECK_INTERVAL_MS = 5_000;
const REOPEN_BASE_DELAY_MS = 1_000;
const REOPEN_MAX_DELAY_MS = 30_000;

/**
 * Latest state of the broadcast pushed over its stream, starting from the loader's. The last state is
 * kept while disconnected and the stream is reopened with backoff, the server sends a fresh state on reconnect.
 */
export function useBroadcastStream({
	url,
	initialState,
	onMessage,
}: {
	url: string;
	initialState: BroadcastState;
	/** Gets the messages other than the state and heartbeats, e.g. clip signaling. */
	onMessage?: (message: BroadcastStreamMessage) => void;
}) {
	const [state, setState] = React.useState(initialState);
	const [isConnected, setIsConnected] = React.useState(false);
	const onMessageRef = React.useRef(onMessage);
	React.useLayoutEffect(() => {
		onMessageRef.current = onMessage;
	});

	React.useEffect(() => {
		let source: EventSource | null = null;
		let reopenTimeout: ReturnType<typeof setTimeout> | undefined;
		let failedReopens = 0;
		let lastMessageAt = Date.now();

		const open = () => {
			lastMessageAt = Date.now();
			source = new EventSource(url);
			source.onmessage = (event) => {
				lastMessageAt = Date.now();
				failedReopens = 0;
				setIsConnected(true);

				const message = JSON.parse(event.data) as BroadcastStreamMessage;
				if (message.kind === "state") setState(message.state);
				else if (message.kind !== "heartbeat") onMessageRef.current?.(message);
			};
			source.onerror = () => {
				setIsConnected(false);
				// CLOSED means the browser gave up reconnecting on its own, e.g. after a non-200 response
				if (source?.readyState === EventSource.CLOSED) reopen();
			};
		};

		const reopen = () => {
			source?.close();
			source = null;
			clearTimeout(reopenTimeout);
			reopenTimeout = setTimeout(
				open,
				Math.min(
					REOPEN_BASE_DELAY_MS * 2 ** failedReopens,
					REOPEN_MAX_DELAY_MS,
				),
			);
			failedReopens++;
		};

		const livenessCheck = setInterval(() => {
			if (
				!source ||
				Date.now() - lastMessageAt < SILENT_CONNECTION_TIMEOUT_MS
			) {
				return;
			}

			setIsConnected(false);
			reopen();
		}, LIVENESS_CHECK_INTERVAL_MS);

		open();

		return () => {
			clearInterval(livenessCheck);
			clearTimeout(reopenTimeout);
			source?.close();
		};
	}, [url]);

	return { state, isConnected };
}

/** Sends the clips to the broadcast's overlays, see `ClipTransfer.createSender`. Pass `onMessage` to `useBroadcastStream`. */
export function useClipSender({
	signalUrl,
	clips,
}: {
	signalUrl: string;
	/** Kept the same between renders, a new array starts over. */
	clips: ReadonlyArray<ClipTransfer.ClipSource>;
}) {
	const [statuses, setStatuses] = React.useState<ClipTransfer.ClipPeerStatus[]>(
		[],
	);
	const senderRef = React.useRef<ClipTransfer.ClipSender | null>(null);

	React.useEffect(() => {
		const sender = ClipTransfer.createSender({
			signalUrl,
			clips,
			onChange: setStatuses,
		});
		senderRef.current = sender;

		return () => {
			sender.close();
			senderRef.current = null;
		};
	}, [signalUrl, clips]);

	const onMessage = (message: BroadcastStreamMessage) =>
		senderRef.current?.handleMessage(message);

	return { statuses, onMessage };
}

/** Object URLs of the clips received from the dashboard by clip id, see `ClipTransfer.createReceiver`. Pass `onMessage` to `useBroadcastStream`. */
export function useClipReceiver({ signalUrl }: { signalUrl: string }) {
	const [urls, setUrls] = React.useState<ReadonlyMap<string, string>>(
		() => new Map(),
	);
	const receiverRef = React.useRef<ClipTransfer.ClipReceiver | null>(null);

	React.useEffect(() => {
		const receiver = ClipTransfer.createReceiver({
			signalUrl,
			onChange: setUrls,
		});
		receiverRef.current = receiver;

		return () => {
			receiver.close();
			receiverRef.current = null;
			setUrls(new Map());
		};
	}, [signalUrl]);

	const onMessage = (message: BroadcastStreamMessage) =>
		receiverRef.current?.handleMessage(message);

	return { urls, onMessage };
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

		return () => {
			isCancelled = true;
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
 * zoomed in on the `zoomTarget` inside it, centering it in the parent's whole box as far as the `zoomedOut` element
 * stays above the view. Without a target the overview stays put. Sets the `--camera-overview` and `--camera-zoom`
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
				scale: overviewScale,
				center: { x: size.width / 2, y: size.height / 2 },
			});

			const target = element.querySelector<HTMLElement>(zoomTarget);
			const hidden = zoomedOut
				? element.querySelector<HTMLElement>(zoomedOut)
				: null;
			const zoom = target
				? cameraTransform({
						box: {
							x: 0,
							y: 0,
							width: parent.clientWidth,
							height: parent.clientHeight,
						},
						scale: Math.max(MIN_ZOOM_SCALE, overviewScale * ZOOM_FACTOR),
						center: centerWithin(target, element),
						hiddenAbove: hidden ? hidden.offsetTop + hidden.offsetHeight : 0,
					})
				: overview;

			element.style.setProperty("--camera-overview", overview);
			element.style.setProperty("--camera-zoom", zoom);
		};

		frame();
		// measured again with the real font once it has loaded
		document.fonts.ready.then(frame);

		return () => {
			isCancelled = true;
		};
	}, [content, zoomTarget, zoomedOut]);

	return ref;
}

/**
 * Transform (origin top left) showing the element at the scale with its point `center` in the middle of the box,
 * moved up when needed to keep its part above `hiddenAbove` out of the box.
 */
function cameraTransform({
	box,
	scale,
	center,
	hiddenAbove = 0,
}: {
	box: { x: number; y: number; width: number; height: number };
	scale: number;
	center: { x: number; y: number };
	hiddenAbove?: number;
}) {
	const x = box.x + box.width / 2 - center.x * scale;
	const y = Math.min(
		box.y + box.height / 2 - center.y * scale,
		box.y - hiddenAbove * scale,
	);

	return `translate(${x}px, ${y}px) scale(${scale})`;
}

/** Center of the element in the coordinates of its ancestor's layout box, transforms not counted. */
function centerWithin(element: HTMLElement, ancestor: HTMLElement) {
	let x = element.offsetWidth / 2;
	let y = element.offsetHeight / 2;
	let node: HTMLElement | null = element;
	while (node && node !== ancestor) {
		x += node.offsetLeft;
		y += node.offsetTop;
		node = node.offsetParent as HTMLElement | null;
	}

	return { x, y };
}
