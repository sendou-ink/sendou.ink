import { logger } from "~/utils/logger";
import type {
	BroadcastOwnPeer,
	BroadcastPeer,
	BroadcastSessionDescription,
	BroadcastStreamMessage,
} from "../broadcast-types";

const RTC_CONFIGURATION: RTCConfiguration = {
	// peers on the same machine or LAN connect over their host candidates, STUN is for ones further apart
	iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
};
// no trickle ICE: a description is posted once its candidates are gathered, or with the ones gathered by then
const ICE_GATHERING_TIMEOUT_MS = 2_000;
const RECONNECT_DELAY_MS = 3_000;
const CHANNEL_LABEL = "clips";
const CHUNK_BYTES = 64 * 1024;
const MAX_BUFFERED_BYTES = 8 * 1024 * 1024;
const LOW_BUFFERED_BYTES = 1024 * 1024;

type ClipChannelMessage =
	/** Receiver → sender as the channel opens, the sender sends the rest. */
	| { type: "have"; clipIds: string[] }
	/** Sender → receiver, followed by `size` bytes of binary chunks. */
	| { type: "clip"; id: string; size: number; mimeType: string }
	/** Receiver → sender once the clip is whole. */
	| { type: "received"; id: string };

export interface ClipSource {
	id: string;
	url: string;
}

/** How sending the clips to one overlay is going. */
export interface ClipPeerStatus {
	peer: BroadcastPeer;
	connectionState: RTCPeerConnectionState;
	/** Clips the overlay was missing as the channel opened, `null` before that. */
	missingCount: number | null;
	receivedCount: number;
	/** From the channel opening to the overlay having the last missing clip. */
	transferMs: number | null;
}

export type ClipSender = ReturnType<typeof createSender>;

export type ClipReceiver = ReturnType<typeof createReceiver>;

/**
 * Sends the clips to every overlay connected to the broadcast's stream (the dashboard's previews included), each
 * over a WebRTC data channel of its own. The stream's messages are fed to `handleMessage`: they tell who the
 * overlays are and carry their answers.
 */
export function createSender({
	signalUrl,
	clips,
	onChange,
}: {
	signalUrl: string;
	clips: ReadonlyArray<ClipSource>;
	onChange: (statuses: ClipPeerStatus[]) => void;
}) {
	let self: BroadcastOwnPeer | null = null;
	let peers: BroadcastPeer[] = [];
	const connections = new Map<
		string,
		{ pc: RTCPeerConnection; status: ClipPeerStatus }
	>();
	const clipData = new Map<
		string,
		Promise<{ data: ArrayBuffer; mimeType: string }>
	>();
	const reconnectTimeouts = new Set<ReturnType<typeof setTimeout>>();

	const emit = () =>
		onChange(Array.from(connections.values(), ({ status }) => status));

	const update = (peerId: string, patch: Partial<ClipPeerStatus>) => {
		const connection = connections.get(peerId);
		if (!connection) return;

		connection.status = { ...connection.status, ...patch };
		emit();
	};

	const disconnect = (peerId: string) => {
		connections.get(peerId)?.pc.close();
		connections.delete(peerId);
	};

	const loadClip = (clip: ClipSource) => {
		let loading = clipData.get(clip.id);
		if (!loading) {
			loading = fetch(clip.url)
				.then((response) => {
					if (!response.ok) throw new Error(`Fetching ${clip.url} failed`);
					return response.blob();
				})
				.then(async (blob) => ({
					data: await blob.arrayBuffer(),
					mimeType: blob.type || "video/mp4",
				}));
			loading.catch(() => clipData.delete(clip.id));
			clipData.set(clip.id, loading);
		}

		return loading;
	};

	const sendMissing = async (
		peerId: string,
		channel: RTCDataChannel,
		have: string[],
	) => {
		const missing = clips.filter((clip) => !have.includes(clip.id));
		update(peerId, { missingCount: missing.length, receivedCount: 0 });

		for (const clip of missing) {
			const { data, mimeType } = await loadClip(clip);
			if (channel.readyState !== "open") return;

			sendJson(channel, {
				type: "clip",
				id: clip.id,
				size: data.byteLength,
				mimeType,
			});
			for (let offset = 0; offset < data.byteLength; offset += CHUNK_BYTES) {
				if (channel.bufferedAmount > MAX_BUFFERED_BYTES) {
					await bufferedAmountLow(channel);
				}
				if (channel.readyState !== "open") return;

				channel.send(
					new Uint8Array(
						data,
						offset,
						Math.min(CHUNK_BYTES, data.byteLength - offset),
					),
				);
			}
		}
	};

	const connect = async (peer: BroadcastPeer) => {
		const pc = new RTCPeerConnection(RTC_CONFIGURATION);
		connections.set(peer.id, {
			pc,
			status: {
				peer,
				connectionState: pc.connectionState,
				missingCount: null,
				receivedCount: 0,
				transferMs: null,
			},
		});
		emit();

		const channel = pc.createDataChannel(CHANNEL_LABEL);
		channel.binaryType = "arraybuffer";
		channel.bufferedAmountLowThreshold = LOW_BUFFERED_BYTES;

		let openedAt = 0;
		channel.onopen = () => {
			openedAt = performance.now();
		};
		channel.onmessage = (event) => {
			if (typeof event.data !== "string") return;

			const message = JSON.parse(event.data) as ClipChannelMessage;
			if (message.type === "have") {
				sendMissing(peer.id, channel, message.clipIds).catch((error) =>
					logger.error("Sending clips failed", error),
				);
			} else if (message.type === "received") {
				const status = connections.get(peer.id)?.status;
				if (!status) return;

				const receivedCount = status.receivedCount + 1;
				update(peer.id, {
					receivedCount,
					transferMs:
						receivedCount === status.missingCount
							? Math.round(performance.now() - openedAt)
							: null,
				});
			}
		};

		pc.onconnectionstatechange = () => {
			if (connections.get(peer.id)?.pc !== pc) return;

			update(peer.id, { connectionState: pc.connectionState });
			if (pc.connectionState !== "failed") return;

			disconnect(peer.id);
			emit();
			const timeout = setTimeout(() => {
				reconnectTimeouts.delete(timeout);
				if (peers.some((known) => known.id === peer.id)) void connect(peer);
			}, RECONNECT_DELAY_MS);
			reconnectTimeouts.add(timeout);
		};

		try {
			await pc.setLocalDescription();
			const description = await gatheredDescription(pc);
			if (!self || connections.get(peer.id)?.pc !== pc) return;

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
		close,
	};
}

/**
 * Receives clips from the dashboards sending them, answering their offers. `onChange` gets the object URLs of
 * every clip received so far by clip id, kept over reconnects until `close`.
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
	const urls = new Map<string, string>();

	const receive = (channel: RTCDataChannel) => {
		channel.binaryType = "arraybuffer";

		let incoming: {
			id: string;
			size: number;
			mimeType: string;
			chunks: ArrayBuffer[];
			receivedBytes: number;
		} | null = null;

		const sendHave = () =>
			sendJson(channel, { type: "have", clipIds: Array.from(urls.keys()) });
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
				}
				return;
			}
			if (!incoming) return;

			const chunk = event.data as ArrayBuffer;
			incoming.chunks.push(chunk);
			incoming.receivedBytes += chunk.byteLength;
			if (incoming.receivedBytes < incoming.size) return;

			if (!urls.has(incoming.id)) {
				urls.set(
					incoming.id,
					URL.createObjectURL(
						new Blob(incoming.chunks, { type: incoming.mimeType }),
					),
				);
				onChange(new Map(urls));
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
		pc.ondatachannel = (event) => receive(event.channel);

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
		close() {
			closeConnections();
			for (const url of urls.values()) URL.revokeObjectURL(url);
			urls.clear();
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
