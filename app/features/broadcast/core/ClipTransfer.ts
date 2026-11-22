import { logger } from "~/utils/logger";
import type {
	BroadcastAudioFeed,
	BroadcastOwnPeer,
	BroadcastPeer,
	BroadcastSessionDescription,
	BroadcastStreamMessage,
} from "../broadcast-types";

const RTC_CONFIGURATION: RTCConfiguration = {
	// the scanner's browser and OBS are on the same machine (or LAN): host candidates connect them, STUN is for ones further apart
	iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
};
// no trickle ICE: a description is posted once its candidates are gathered, or with the ones gathered by then
const ICE_GATHERING_TIMEOUT_MS = 2_000;
const RECONNECT_DELAY_MS = 3_000;
const CHANNEL_LABEL = "clips";
const CHUNK_BYTES = 64 * 1024;
const MAX_BUFFERED_BYTES = 8 * 1024 * 1024;
const LOW_BUFFERED_BYTES = 1024 * 1024;
/**
 * A connection's first big transfer between two browsers trickles for 10-25 s before going at full speed (measured
 * locally, a 39 MB clip then took a second), so a connection idle without one gets this many throwaway bytes,
 * leaving the picked clips to go fast. The overlay ignores bytes not after a clip's header.
 */
const WARM_UP_BYTES = 8 * 1024 * 1024;
/** Who gets a clip first: OBS plays it on air. */
const PEER_ROLE_ORDER: ReadonlyArray<BroadcastPeer["role"]> = [
	"source",
	"preview",
	"dashboard",
];

type ClipChannelMessage =
	/** Receiver → sender as the channel opens, the sender sends the rest. */
	| { type: "have"; clipIds: string[] }
	/** Sender → receiver whenever its clips change: the ones it sent before and left out here can go. */
	| { type: "keep"; clipIds: string[] }
	/** Sender → receiver, followed by `size` bytes of binary chunks. */
	| { type: "clip"; id: string; size: number; mimeType: string }
	/** Receiver → sender once the clip is whole. */
	| { type: "received"; id: string }
	/** Receiver → sender, a few times a second: what its audio feeds sound like. */
	| { type: "feeds"; feeds: BroadcastAudioFeed[] };

export interface ClipSource {
	id: string;
	/** The clip's video, read once an overlay needs it. */
	load: () => Promise<Blob>;
}

/** How sending the clips to one overlay is going. */
export interface ClipPeerStatus {
	peer: BroadcastPeer;
	connectionState: RTCPeerConnectionState;
	/** The clips being sent that the overlay has, `null` until it told which it has. */
	receivedClipIds: string[] | null;
	clipCount: number;
	/** From sending the overlay its last clip to it arriving, `null` before one did. */
	transferMs: number | null;
}

export type ClipSender = ReturnType<typeof createSender>;

export type ClipReceiver = ReturnType<typeof createReceiver>;

interface SenderConnection {
	pc: RTCPeerConnection;
	peer: BroadcastPeer;
	channel: RTCDataChannel;
	/** What the overlay has, `null` until it said. */
	has: Set<string> | null;
	/** Clips sent whole that the overlay hasn't confirmed yet, by when they started being sent (`performance.now()`). */
	unconfirmed: Map<string, number>;
	/** Got its first big transfer (a clip, or the throwaway bytes), after which they go fast. */
	isWarm: boolean;
	transferMs: number | null;
}

/**
 * Sends the clips to every overlay connected to the broadcast's stream (the dashboard's previews included), each
 * over a WebRTC data channel of its own. The stream's messages are fed to `handleMessage`: they tell who the
 * overlays are and carry their answers. The clips go in their order, a clip earlier in it cutting in on one being
 * sent. `setClips` changes the clips without reconnecting: the overlays get the new ones and let go of the ones left
 * out, one being sent stops. The overlays report their audio feeds back over the same channels to
 * `onFeeds`, `null` once the overlay is gone.
 */
export function createSender({
	signalUrl,
	clips: initialClips,
	onChange,
	onFeeds,
}: {
	signalUrl: string;
	clips: ReadonlyArray<ClipSource>;
	onChange: (statuses: ClipPeerStatus[]) => void;
	onFeeds?: (peerId: string, feeds: BroadcastAudioFeed[] | null) => void;
}) {
	let self: BroadcastOwnPeer | null = null;
	let peers: BroadcastPeer[] = [];
	let clips = initialClips;
	const connections = new Map<string, SenderConnection>();
	const clipData = new Map<
		string,
		Promise<{ data: ArrayBuffer; mimeType: string }>
	>();
	/** Clips whose video couldn't be read (e.g. deleted meanwhile), skipped until the clips change. */
	const unreadable = new Set<string>();
	let isSending = false;
	const reconnectTimeouts = new Set<ReturnType<typeof setTimeout>>();

	const statusOf = (connection: SenderConnection): ClipPeerStatus => ({
		peer: connection.peer,
		connectionState: connection.pc.connectionState,
		receivedClipIds: connection.has
			? clips.flatMap((clip) => (connection.has?.has(clip.id) ? [clip.id] : []))
			: null,
		clipCount: clips.length,
		transferMs: connection.transferMs,
	});

	const emit = () => onChange(Array.from(connections.values(), statusOf));

	const disconnect = (peerId: string) => {
		connections.get(peerId)?.pc.close();
		connections.delete(peerId);
		onFeeds?.(peerId, null);
	};

	const loadClip = (clip: ClipSource) => {
		let loading = clipData.get(clip.id);
		if (!loading) {
			loading = clip.load().then(async (blob) => ({
				data: await blob.arrayBuffer(),
				mimeType: blob.type || "video/mp4",
			}));
			loading.catch(() => clipData.delete(clip.id));
			clipData.set(clip.id, loading);
		}

		return loading;
	};

	const isMissing = (connection: SenderConnection, clipId: string) =>
		!connection.has?.has(clipId) &&
		!connection.unconfirmed.has(clipId) &&
		!unreadable.has(clipId);

	/**
	 * What to send next and to which overlay: the first clip some overlay is missing, OBS before the previews, else
	 * throwaway bytes to an overlay no clip went to yet (`clip` `null`, see `WARM_UP_BYTES`).
	 */
	const nextTransfer = () => {
		const ready = Array.from(connections.values())
			.filter(
				(connection) =>
					connection.has !== null && connection.channel.readyState === "open",
			)
			.sort(
				(a, b) =>
					PEER_ROLE_ORDER.indexOf(a.peer.role) -
					PEER_ROLE_ORDER.indexOf(b.peer.role),
			);
		for (const clip of clips) {
			const connection = ready.find((candidate) =>
				isMissing(candidate, clip.id),
			);
			if (connection) return { connection, clip };
		}
		const cold = ready.find((connection) => !connection.isWarm);

		return cold ? { connection: cold, clip: null } : null;
	};

	/** Sends the bytes in chunks, `false` when they stopped part way as something else is due first. */
	const sendBytes = async (
		connection: SenderConnection,
		data: ArrayBuffer,
		clipId: string | null,
	) => {
		const { channel } = connection;
		for (let offset = 0; offset < data.byteLength; offset += CHUNK_BYTES) {
			if (channel.bufferedAmount > MAX_BUFFERED_BYTES) {
				await bufferedAmountLow(channel);
			}
			const next = nextTransfer();
			if (
				channel.readyState !== "open" ||
				next?.connection !== connection ||
				(next.clip?.id ?? null) !== clipId
			) {
				return false;
			}

			channel.send(
				new Uint8Array(
					data,
					offset,
					Math.min(CHUNK_BYTES, data.byteLength - offset),
				),
			);
		}
		connection.isWarm = true;

		return true;
	};

	/** Sends the clip whole, the overlay dropping a part stopped part way at the next clip. */
	const sendClip = async (connection: SenderConnection, clip: ClipSource) => {
		const { data, mimeType } = await loadClip(clip);
		const next = nextTransfer();
		if (next?.connection !== connection || next.clip?.id !== clip.id) return;

		const sentAt = performance.now();
		sendJson(connection.channel, {
			type: "clip",
			id: clip.id,
			size: data.byteLength,
			mimeType,
		});
		if (await sendBytes(connection, data, clip.id)) {
			connection.unconfirmed.set(clip.id, sentAt);
		}
	};

	/**
	 * Sends the clips one transfer at a time until every overlay has them all: several big transfers at once stalled
	 * one of them for seconds, while one after another each clip took a second or two.
	 */
	const pump = async () => {
		if (isSending) return;

		isSending = true;
		try {
			for (let next = nextTransfer(); next; next = nextTransfer()) {
				const { connection, clip } = next;
				if (!clip) {
					// cut off it starts over once nothing else is due, `sendBytes` marks it warm once whole
					await sendBytes(connection, new ArrayBuffer(WARM_UP_BYTES), null);
					continue;
				}

				try {
					await sendClip(connection, clip);
				} catch (error) {
					unreadable.add(clip.id);
					logger.error("Sending a clip failed", error);
				}
			}
		} finally {
			isSending = false;
		}
	};

	/** Tells the overlay which clips to keep and sends the ones it lacks. */
	const sync = (connection: SenderConnection) => {
		const { channel, has } = connection;
		if (!has || channel.readyState !== "open") return;

		const clipIds = clips.map((clip) => clip.id);
		sendJson(channel, { type: "keep", clipIds });
		// the overlay drops the ones left out, so picking one again sends it again
		for (const id of has) {
			if (!clipIds.includes(id)) has.delete(id);
		}
		for (const id of connection.unconfirmed.keys()) {
			if (!clipIds.includes(id)) connection.unconfirmed.delete(id);
		}
		void pump();
	};

	const connect = async (peer: BroadcastPeer) => {
		const pc = new RTCPeerConnection(RTC_CONFIGURATION);
		const channel = pc.createDataChannel(CHANNEL_LABEL);
		channel.binaryType = "arraybuffer";
		channel.bufferedAmountLowThreshold = LOW_BUFFERED_BYTES;
		const connection: SenderConnection = {
			pc,
			peer,
			channel,
			has: null,
			unconfirmed: new Map(),
			isWarm: false,
			transferMs: null,
		};
		connections.set(peer.id, connection);
		emit();

		channel.onmessage = (event) => {
			if (typeof event.data !== "string") return;
			if (connections.get(peer.id) !== connection) return;

			const message = JSON.parse(event.data) as ClipChannelMessage;
			if (message.type === "have") {
				connection.has = new Set(message.clipIds);
				sync(connection);
				emit();
			} else if (message.type === "feeds") {
				onFeeds?.(peer.id, message.feeds);
			} else if (message.type === "received") {
				const sentAt = connection.unconfirmed.get(message.id);
				// left out meanwhile, the overlay drops it again
				if (sentAt === undefined) return;

				connection.unconfirmed.delete(message.id);
				connection.has?.add(message.id);
				connection.transferMs = Math.round(performance.now() - sentAt);
				emit();
			}
		};

		pc.onconnectionstatechange = () => {
			if (connections.get(peer.id) !== connection) return;

			emit();
			if (pc.connectionState !== "failed") return;

			disconnect(peer.id);
			emit();
			const timeout = setTimeout(() => {
				reconnectTimeouts.delete(timeout);
				if (
					peers.some((known) => known.id === peer.id) &&
					!connections.has(peer.id)
				) {
					void connect(peer);
				}
			}, RECONNECT_DELAY_MS);
			reconnectTimeouts.add(timeout);
		};

		try {
			await pc.setLocalDescription();
			const description = await gatheredDescription(pc);
			if (!self || connections.get(peer.id) !== connection) return;

			await postSignal({
				signalUrl,
				token: self.token,
				to: peer.id,
				description,
			});
		} catch (error) {
			logger.error("Offering clips failed", error);
		}
	};

	const syncPeers = () => {
		for (const peerId of connections.keys()) {
			if (!peers.some((peer) => peer.id === peerId)) disconnect(peerId);
		}
		for (const peer of peers) {
			if (!connections.has(peer.id)) void connect(peer);
		}
		emit();
	};

	const close = () => {
		for (const timeout of reconnectTimeouts) clearTimeout(timeout);
		reconnectTimeouts.clear();
		for (const peerId of Array.from(connections.keys())) disconnect(peerId);
		emit();
	};

	return {
		handleMessage(message: BroadcastStreamMessage) {
			switch (message.kind) {
				case "hello": {
					// a new connection to the stream, the overlays answer to the new peer id
					close();
					self = message.peer;
					return;
				}
				case "peers": {
					peers = message.peers;
					if (self) syncPeers();
					return;
				}
				case "signal": {
					const connection = connections.get(message.from);
					if (!connection || message.description.type !== "answer") return;

					connection.pc
						.setRemoteDescription(message.description)
						.catch((error) => logger.error("Answer rejected", error));
					return;
				}
			}
		},
		/** The clips to send from now on, the overlays let go of the ones it doesn't list anymore. */
		setClips(next: ReadonlyArray<ClipSource>) {
			clips = next;
			unreadable.clear();
			for (const id of clipData.keys()) {
				if (!clips.some((clip) => clip.id === id)) clipData.delete(id);
			}
			for (const connection of connections.values()) sync(connection);
			emit();
		},
		close,
	};
}

/**
 * Receives clips from the dashboards sending them, answering their offers. `onChange` gets the object URLs of
 * every clip received so far by clip id, kept over reconnects until the dashboard that sent it leaves it out or
 * `close`. `sendFeeds` reports the overlay's audio feeds to every dashboard connected.
 */
export function createReceiver({
	signalUrl,
	onChange,
}: {
	signalUrl: string;
	onChange: (urls: ReadonlyMap<string, string>) => void;
}) {
	let self: BroadcastOwnPeer | null = null;
	const connections = new Map<string, RTCPeerConnection>();
	const channels = new Set<RTCDataChannel>();
	/** `from`: the dashboard that sent it, or last listed it to keep. */
	const clips = new Map<string, { url: string; from: string }>();

	const publish = () =>
		onChange(new Map(Array.from(clips, ([id, { url }]) => [id, url])));

	const keepOnly = (from: string, clipIds: string[]) => {
		let isChanged = false;
		for (const [id, clip] of clips) {
			if (clipIds.includes(id)) {
				clip.from = from;
			} else if (clip.from === from) {
				URL.revokeObjectURL(clip.url);
				clips.delete(id);
				isChanged = true;
			}
		}
		if (isChanged) publish();
	};

	const receive = (channel: RTCDataChannel, from: string) => {
		channel.binaryType = "arraybuffer";
		channels.add(channel);
		channel.addEventListener("close", () => channels.delete(channel));

		let incoming: {
			id: string;
			size: number;
			mimeType: string;
			chunks: ArrayBuffer[];
			receivedBytes: number;
		} | null = null;

		const sendHave = () =>
			sendJson(channel, { type: "have", clipIds: Array.from(clips.keys()) });
		if (channel.readyState === "open") sendHave();
		else channel.onopen = sendHave;

		channel.onmessage = (event) => {
			if (typeof event.data === "string") {
				const message = JSON.parse(event.data) as ClipChannelMessage;
				if (message.type === "clip") {
					incoming = {
						id: message.id,
						size: message.size,
						mimeType: message.mimeType,
						chunks: [],
						receivedBytes: 0,
					};
				} else if (message.type === "keep") {
					keepOnly(from, message.clipIds);
					if (incoming && !message.clipIds.includes(incoming.id)) {
						incoming = null;
					}
				}
				return;
			}
			if (!incoming) return;

			const chunk = event.data as ArrayBuffer;
			incoming.chunks.push(chunk);
			incoming.receivedBytes += chunk.byteLength;
			if (incoming.receivedBytes < incoming.size) return;

			if (!clips.has(incoming.id)) {
				clips.set(incoming.id, {
					url: URL.createObjectURL(
						new Blob(incoming.chunks, { type: incoming.mimeType }),
					),
					from,
				});
				publish();
			}
			sendJson(channel, { type: "received", id: incoming.id });
			incoming = null;
		};
	};

	const answer = async (
		from: string,
		description: BroadcastSessionDescription,
	) => {
		connections.get(from)?.close();
		const pc = new RTCPeerConnection(RTC_CONFIGURATION);
		connections.set(from, pc);
		pc.ondatachannel = (event) => receive(event.channel, from);

		try {
			await pc.setRemoteDescription(description);
			await pc.setLocalDescription();
			const answerDescription = await gatheredDescription(pc);
			if (!self || connections.get(from) !== pc) return;

			await postSignal({
				signalUrl,
				token: self.token,
				to: from,
				description: answerDescription,
			});
		} catch (error) {
			logger.error("Answering a clip offer failed", error);
		}
	};

	const closeConnections = () => {
		for (const pc of connections.values()) pc.close();
		connections.clear();
		channels.clear();
	};

	return {
		handleMessage(message: BroadcastStreamMessage) {
			if (message.kind === "hello") {
				closeConnections();
				self = message.peer;
			} else if (
				message.kind === "signal" &&
				message.description.type === "offer"
			) {
				void answer(message.from, message.description);
			}
		},
		sendFeeds(feeds: BroadcastAudioFeed[]) {
			for (const channel of channels) {
				if (channel.readyState === "open") {
					sendJson(channel, { type: "feeds", feeds });
				}
			}
		},
		close() {
			closeConnections();
			for (const { url } of clips.values()) URL.revokeObjectURL(url);
			clips.clear();
		},
	};
}

async function gatheredDescription(
	pc: RTCPeerConnection,
): Promise<BroadcastSessionDescription> {
	if (pc.iceGatheringState !== "complete") {
		await new Promise<void>((resolve) => {
			const timeout = setTimeout(resolve, ICE_GATHERING_TIMEOUT_MS);
			pc.addEventListener("icegatheringstatechange", () => {
				if (pc.iceGatheringState !== "complete") return;

				clearTimeout(timeout);
				resolve();
			});
		});
	}

	const description = pc.localDescription;
	if (
		!description ||
		(description.type !== "offer" && description.type !== "answer")
	) {
		throw new Error("No local description to send");
	}

	return { type: description.type, sdp: description.sdp };
}

async function postSignal({
	signalUrl,
	...body
}: {
	signalUrl: string;
	token: string;
	to: string;
	description: BroadcastSessionDescription;
}) {
	const response = await fetch(signalUrl, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(body),
	});
	if (!response.ok) throw new Error(`Signaling failed (${response.status})`);
}

function sendJson(channel: RTCDataChannel, message: ClipChannelMessage) {
	channel.send(JSON.stringify(message));
}

function bufferedAmountLow(channel: RTCDataChannel) {
	return new Promise<void>((resolve) => {
		channel.addEventListener("bufferedamountlow", () => resolve(), {
			once: true,
		});
		channel.addEventListener("close", () => resolve(), { once: true });
	});
}
