import * as R from "remeda";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type {
	BroadcastAudioFeed,
	BroadcastKey,
	BroadcastOwnPeer,
	BroadcastPeer,
	BroadcastSessionDescription,
	BroadcastStreamMessage,
} from "../broadcast-types";
import { broadcastSignalUrl } from "../broadcast-urls";
import * as ClipTransfer from "./ClipTransfer";

const BROADCAST = { tournamentId: 1, slug: "sendouink" };
const SIGNAL_URL = broadcastSignalUrl(BROADCAST);
const CHUNK_BYTES = 64 * 1024;
const MAX_BUFFERED_BYTES = 8 * 1024 * 1024;
const WARM_UP_BYTES = 8 * 1024 * 1024;

const OVERLAY: BroadcastOwnPeer = { id: "overlay", token: "overlay-token" };

let network: ReturnType<typeof createNetwork>;

beforeEach(() => {
	network = createNetwork();
	vi.stubGlobal("RTCPeerConnection", FakePeerConnection);
	vi.stubGlobal("fetch", network.fetch);
	vi.spyOn(URL, "createObjectURL").mockImplementation((blob) => {
		const url = `blob:${network.blobs.size}`;
		network.blobs.set(url, blob as Blob);
		return url;
	});
	vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
});

afterEach(() => {
	network.close();
});

describe("ClipTransfer", () => {
	test("sends the clips in 64 KB chunks the overlay puts back together", async () => {
		const clips = [
			network.clip("long", 2 * CHUNK_BYTES + 100),
			network.clip("short", 10),
		];
		network.sender("dashboard", clips);
		const overlay = network.receiver();

		await vi.waitFor(() => expect(overlay.urls().size).toBe(2));

		expect(await overlay.clip("long")).toEqual(network.bytes("long"));
		expect(await overlay.clip("short")).toEqual(network.bytes("short"));
		expect(network.chunkSizes()).toEqual([CHUNK_BYTES, CHUNK_BYTES, 100, 10]);
	});

	test("keeps the clip's type", async () => {
		network.sender("dashboard", [network.clip("clip", 10, "video/webm")]);
		const overlay = network.receiver();

		await vi.waitFor(() => expect(overlay.urls().size).toBe(1));

		expect(overlay.blob("clip").type).toBe("video/webm");
	});

	test("sends only the clips the overlay doesn't have yet", async () => {
		const first = network.clip("first", 10);
		const second = network.clip("second", 10);
		network.sender("dashboard", [first]);
		const overlay = network.receiver();
		await vi.waitFor(() => expect(overlay.urls().size).toBe(1));

		const other = network.sender("other-dashboard", [first, second]);

		await vi.waitFor(() => expect(overlay.urls().size).toBe(2));
		expect(other.sentClipIds()).toEqual(["second"]);
		expect(other.statuses()).toEqual([
			expect.objectContaining({
				clipCount: 2,
				receivedClipIds: ["first", "second"],
			}),
		]);
	});

	test("sends a clip added later without reconnecting", async () => {
		const first = network.clip("first", 10);
		const sender = network.sender("dashboard", [first]);
		const overlay = network.receiver();
		await vi.waitFor(() => expect(overlay.urls().size).toBe(1));
		const channelCount = network.openChannelCount();

		sender.setClips([first, network.clip("second", 10)]);

		await vi.waitFor(() =>
			expect(Array.from(overlay.urls().keys())).toEqual(["first", "second"]),
		);
		expect(sender.sentClipIds()).toEqual(["first", "second"]);
		expect(network.openChannelCount()).toBe(channelCount);
	});

	test("lets the overlay drop the clips the dashboard stops sending", async () => {
		const first = network.clip("first", 10);
		const second = network.clip("second", 10);
		const sender = network.sender("dashboard", [first, second]);
		const overlay = network.receiver();
		await vi.waitFor(() => expect(overlay.urls().size).toBe(2));
		const firstUrl = overlay.urls().get("first");

		sender.setClips([second]);

		await vi.waitFor(() =>
			expect(Array.from(overlay.urls().keys())).toEqual(["second"]),
		);
		expect(URL.revokeObjectURL).toHaveBeenCalledWith(firstUrl);
		expect(sender.statuses()).toEqual([
			expect.objectContaining({ clipCount: 1, receivedClipIds: ["second"] }),
		]);
	});

	test("drops the replay clips once the overlay connects to another broadcast, keeping its music", async () => {
		network.sender("dashboard", [
			network.clip("clip", 10),
			network.clip("track", 10, "audio/mpeg", "music"),
		]);
		const overlay = network.receiver();
		await vi.waitFor(() => expect(overlay.clipCount()).toBe(2));

		overlay.hello({ tournamentId: 2, slug: "other" });

		expect(overlay.urls("clip").size).toBe(0);
		expect(overlay.urls("music").size).toBe(1);
	});

	test("keeps the clips over a reconnect to the same broadcast", async () => {
		network.sender("dashboard", [network.clip("clip", 10)]);
		const overlay = network.receiver();
		await vi.waitFor(() => expect(overlay.urls().size).toBe(1));

		overlay.hello(BROADCAST);

		expect(overlay.urls().size).toBe(1);
	});

	test("sends a clip again once the overlay dropped it", async () => {
		const first = network.clip("first", 10);
		const second = network.clip("second", 10);
		const sender = network.sender("dashboard", [first]);
		const overlay = network.receiver();
		await vi.waitFor(() => expect(overlay.urls().size).toBe(1));
		sender.setClips([second]);
		await vi.waitFor(() =>
			expect(Array.from(overlay.urls().keys())).toEqual(["second"]),
		);

		sender.setClips([first]);

		await vi.waitFor(() =>
			expect(Array.from(overlay.urls().keys())).toEqual(["first"]),
		);
		expect(sender.sentClipIds()).toEqual(["first", "second", "first"]);
		expect(sender.statuses()).toEqual([
			expect.objectContaining({ clipCount: 1, receivedClipIds: ["first"] }),
		]);
	});

	test("sends a clip put before the one about to go first", async () => {
		const prefetched = held(network.clip("prefetched", 10));
		const sender = network.sender("dashboard", [prefetched.clip]);
		const overlay = network.receiver();
		await vi.waitFor(() => expect(prefetched.isLoading()).toBe(true));
		const picked = network.clip("picked", 10);

		sender.setClips([picked, prefetched.clip]);
		prefetched.release();

		await vi.waitFor(() => expect(overlay.urls().size).toBe(2));
		expect(sender.sentClipIds()).toEqual(["picked", "prefetched"]);
	});

	test("stops sending a clip left out", async () => {
		const dropped = held(network.clip("dropped", 10));
		const sender = network.sender("dashboard", [dropped.clip]);
		network.receiver();
		await vi.waitFor(() => expect(dropped.isLoading()).toBe(true));

		sender.setClips([]);
		dropped.release();

		await vi.waitFor(() =>
			expect(sender.statuses()).toEqual([
				expect.objectContaining({ clipCount: 0 }),
			]),
		);
		expect(sender.sentClipIds()).toEqual([]);
	});

	test("warms an idle overlay up with bytes it ignores", async () => {
		const sender = network.sender("dashboard", []);
		const overlay = network.receiver();

		await vi.waitFor(() =>
			expect(R.sum(network.chunkSizes())).toBe(WARM_UP_BYTES),
		);
		sender.setClips([network.clip("clip", 10)]);

		await vi.waitFor(() => expect(overlay.urls().size).toBe(1));
		expect(await overlay.clip("clip")).toEqual(network.bytes("clip"));
	});

	test("keeps the clips one dashboard sent while another sends none", async () => {
		network.sender("dashboard", [network.clip("clip", 10)]);
		const other = network.sender("other-dashboard", []);
		const overlay = network.receiver();
		await vi.waitFor(() => expect(overlay.urls().size).toBe(1));

		other.setClips([]);
		await vi.waitFor(() =>
			expect(network.keepMessageCount()).toBeGreaterThan(2),
		);

		expect(Array.from(overlay.urls().keys())).toEqual(["clip"]);
	});

	test("reports each overlay's progress until it has every clip", async () => {
		const sender = network.sender("dashboard", [
			network.clip("first", 10),
			network.clip("second", 10),
		]);
		network.receiver();

		await vi.waitFor(() =>
			expect(sender.statuses()).toEqual([
				{
					peer: { id: OVERLAY.id, role: "source" },
					connectionState: "connected",
					receivedClipIds: ["first", "second"],
					clipCount: 2,
					transferMs: expect.any(Number),
				},
			]),
		);
	});

	test("carries the overlay's audio feeds back to every dashboard", async () => {
		const sender = network.sender("dashboard", []);
		const other = network.sender("other-dashboard", []);
		const overlay = network.receiver();
		await vi.waitFor(() =>
			expect(network.openChannelCount()).toBeGreaterThanOrEqual(4),
		);

		const feeds = [{ id: 1, isConnected: true, loudness: 30 }];
		overlay.sendFeeds(feeds);

		await vi.waitFor(() => expect(sender.feeds()).toEqual(feeds));
		expect(other.feeds()).toEqual(feeds);
	});

	test("sends music only to the program, the dashboard's previews playing no sound", async () => {
		const sender = network.sender("dashboard", [
			network.clip("clip", 10),
			network.clip("track", 10, "audio/mpeg", "music"),
		]);
		const preview = network.receiver({ role: "preview" });

		await vi.waitFor(() =>
			expect(sender.statuses()).toEqual([
				expect.objectContaining({ receivedClipIds: ["clip"], clipCount: 1 }),
			]),
		);
		expect(sender.sentClipIds()).toEqual(["clip"]);
		expect(preview.clipCount()).toBe(1);
	});

	test("sends the music after the other clips", async () => {
		const sender = network.sender("dashboard", [
			network.clip("track", 10, "audio/mpeg", "music"),
			network.clip("clip", 10),
		]);
		const overlay = network.receiver();

		await vi.waitFor(() => expect(overlay.clipCount()).toBe(2));
		expect(sender.sentClipIds()).toEqual(["clip", "track"]);
	});

	test("keeps the music it receives in its cache, not the replay clips", async () => {
		const cache = memoryCache();
		network.sender("dashboard", [
			network.clip("clip", 10),
			network.clip("track", 10, "audio/mpeg", "music"),
		]);
		const overlay = network.receiver({ cache });

		await vi.waitFor(() => expect(overlay.clipCount()).toBe(2));
		await vi.waitFor(() =>
			expect(cache.saved().map((clip) => clip.id)).toEqual(["track"]),
		);
	});

	test("isn't sent again what its cache has", async () => {
		const cache = memoryCache([
			{
				id: "track",
				kind: "music",
				blob: new Blob([new Uint8Array(10)], { type: "audio/mpeg" }),
			},
		]);
		const overlay = network.receiver({ cache });
		const sender = network.sender("dashboard", [
			network.clip("track", 10, "audio/mpeg", "music"),
			network.clip("other", 10, "audio/mpeg", "music"),
		]);

		await vi.waitFor(() => expect(overlay.urls("music").size).toBe(2));
		expect(sender.sentClipIds()).toEqual(["other"]);
	});

	test("waits for the channel to drain before buffering more than 8 MB", async () => {
		const size = MAX_BUFFERED_BYTES + 4 * CHUNK_BYTES;
		network.sender("dashboard", [network.clip("big", size)]);
		const overlay = network.receiver();

		await vi.waitFor(() => expect(overlay.urls().size).toBe(1));

		expect(network.maxBufferedBytes()).toBeLessThanOrEqual(
			MAX_BUFFERED_BYTES + CHUNK_BYTES,
		);
		expect(
			Buffer.from(await overlay.clip("big")).equals(
				Buffer.from(network.bytes("big")),
			),
		).toBe(true);
	});
});

/** A cache held in memory, see `ClipTransfer.ClipCache`. */
function memoryCache(initial: ClipTransfer.CachedClip[] = []) {
	const saved: ClipTransfer.CachedClip[] = [];

	return {
		load: async () => initial,
		save: async (clip: ClipTransfer.CachedClip) => {
			saved.push(clip);
		},
		saved: () => saved,
	};
}

/** The clip with its video read only once `release`d, to change the clips while it's on its way. */
function held(clip: ClipTransfer.ClipSource) {
	let release = () => {};
	let isLoading = false;
	const released = new Promise<void>((resolve) => {
		release = resolve;
	});

	return {
		clip: {
			...clip,
			load: async () => {
				isLoading = true;
				await released;
				return clip.load();
			},
		},
		release,
		isLoading: () => isLoading,
	};
}

/**
 * Stands in for the broadcast's stream and signal route: posted descriptions reach the peer they are for as the
 * stream's `signal` message. Clips load generated bytes.
 */
function createNetwork() {
	const peers = new Map<
		string,
		{
			token: string;
			handleMessage: (message: BroadcastStreamMessage) => void;
			close: () => void;
		}
	>();
	const files = new Map<string, { bytes: Uint8Array; mimeType: string }>();
	let overlayRole: BroadcastPeer["role"] = "source";
	const blobs = new Map<string, Blob>();
	const channels: FakeDataChannel[] = [];
	FakeDataChannel.created = channels;

	const fetch = async (url: string, init?: RequestInit) => {
		if (url !== SIGNAL_URL) return new Response(null, { status: 404 });

		const body = JSON.parse(String(init?.body)) as {
			token: string;
			to: string;
			description: BroadcastSessionDescription;
		};
		const from = Array.from(peers).find(
			([, peer]) => peer.token === body.token,
		)?.[0];
		const target = peers.get(body.to);
		if (!from || !target) return new Response(null, { status: 404 });

		target.handleMessage({
			kind: "signal",
			from,
			description: body.description,
		});
		return new Response(null, { status: 204 });
	};

	const sentMessages = (senderChannels: FakeDataChannel[]) =>
		senderChannels.flatMap((channel) => channel.sentMessages);

	return {
		fetch,
		blobs,
		clip(
			id: string,
			size: number,
			mimeType = "video/mp4",
			kind: ClipTransfer.ClipKind = "clip",
		): ClipTransfer.ClipSource {
			const bytes = new Uint8Array(size);
			for (let i = 0; i < size; i++) bytes[i] = (i * 31 + id.length) % 256;
			files.set(id, { bytes, mimeType });

			return {
				id,
				kind,
				load: async () => new Blob([bytes.slice()], { type: mimeType }),
			};
		},
		bytes(id: string) {
			return files.get(id)!.bytes;
		},
		sender(id: string, clips: ClipTransfer.ClipSource[]) {
			const self = { id, token: `${id}-token` };
			let statuses: ClipTransfer.ClipPeerStatus[] = [];
			let feeds: BroadcastAudioFeed[] | null = null;
			const createdBefore = channels.length;
			const sender = ClipTransfer.createSender({
				signalUrl: SIGNAL_URL,
				clips,
				onChange: (changed) => {
					statuses = changed;
				},
				onFeeds: (_peerId, reported) => {
					feeds = reported;
				},
			});
			peers.set(id, { token: self.token, ...sender });
			sender.handleMessage({
				kind: "hello",
				peer: self,
				now: Date.now(),
				broadcast: BROADCAST,
			});
			if (peers.has(OVERLAY.id)) {
				sender.handleMessage({
					kind: "peers",
					peers: [{ id: OVERLAY.id, role: overlayRole }],
				});
			}
			const ownChannels = () =>
				channels.slice(createdBefore).filter((channel) => channel.isOfferer);

			return {
				setClips: sender.setClips,
				statuses: () => statuses,
				feeds: () => feeds,
				sentClipIds: () =>
					sentMessages(ownChannels()).flatMap((message) =>
						message.type === "clip" ? [message.id] : [],
					),
			};
		},
		receiver({
			role = "source",
			cache,
		}: {
			role?: BroadcastPeer["role"];
			cache?: ClipTransfer.ClipCache;
		} = {}) {
			overlayRole = role;
			let received: ClipTransfer.ReceivedClips = {
				clip: new Map(),
				music: new Map(),
			};
			const receiver = ClipTransfer.createReceiver({
				onChange: (changed) => {
					received = changed;
				},
				cache,
			});
			peers.set(OVERLAY.id, { token: OVERLAY.token, ...receiver });
			receiver.handleMessage({
				kind: "hello",
				peer: OVERLAY,
				now: Date.now(),
				broadcast: BROADCAST,
			});
			for (const [id, peer] of peers) {
				if (id === OVERLAY.id) continue;

				peer.handleMessage({
					kind: "peers",
					peers: [{ id: OVERLAY.id, role }],
				});
			}
			const urlOf = (clipId: string) =>
				Object.values(received)
					.map((kindUrls) => kindUrls.get(clipId))
					.find(Boolean)!;
			const blob = (clipId: string) => blobs.get(urlOf(clipId))!;

			return {
				urls: (kind: ClipTransfer.ClipKind = "clip") => received[kind],
				clipCount: () =>
					Object.values(received).reduce(
						(count, kindUrls) => count + kindUrls.size,
						0,
					),
				hello: (broadcast: BroadcastKey) =>
					receiver.handleMessage({
						kind: "hello",
						peer: OVERLAY,
						now: Date.now(),
						broadcast,
					}),
				sendFeeds: receiver.sendFeeds,
				blob,
				clip: async (clipId: string) =>
					new Uint8Array(await blob(clipId).arrayBuffer()),
			};
		},
		chunkSizes() {
			return channels
				.filter((channel) => channel.isOfferer)
				.flatMap((channel) => channel.sentChunkSizes);
		},
		keepMessageCount() {
			return channels.flatMap((channel) =>
				channel.sentMessages.filter((message) => message.type === "keep"),
			).length;
		},
		openChannelCount() {
			return channels.filter((channel) => channel.readyState === "open").length;
		},
		maxBufferedBytes() {
			return Math.max(...channels.map((channel) => channel.maxBufferedAmount));
		},
		close() {
			for (const peer of peers.values()) peer.close();
		},
	};
}

/** Pairs with the peer connection whose answer it gets, opening a data channel pair per channel it created. */
class FakePeerConnection {
	static bySdp = new Map<string, FakePeerConnection>();
	static count = 0;

	connectionState: RTCPeerConnectionState = "new";
	iceGatheringState: RTCIceGatheringState = "complete";
	localDescription: BroadcastSessionDescription | null = null;
	remoteDescription: BroadcastSessionDescription | null = null;
	ondatachannel: ((event: { channel: FakeDataChannel }) => void) | null = null;
	onconnectionstatechange: (() => void) | null = null;
	private readonly channels: FakeDataChannel[] = [];

	createDataChannel(label: string) {
		const channel = new FakeDataChannel(label, true);
		this.channels.push(channel);
		return channel;
	}

	async setLocalDescription() {
		const sdp = `sdp-${FakePeerConnection.count++}`;
		this.localDescription = {
			type: this.remoteDescription ? "answer" : "offer",
			sdp,
		};
		FakePeerConnection.bySdp.set(sdp, this);
	}

	async setRemoteDescription(description: BroadcastSessionDescription) {
		this.remoteDescription = description;
		if (description.type !== "answer") return;

		const answerer = FakePeerConnection.bySdp.get(description.sdp)!;
		for (const channel of this.channels) {
			const remote = new FakeDataChannel(channel.label, false);
			channel.peer = remote;
			remote.peer = channel;
			answerer.ondatachannel?.({ channel: remote });
			queueMicrotask(() => {
				channel.open();
				remote.open();
			});
		}
		for (const pc of [this, answerer]) {
			queueMicrotask(() => pc.setConnectionState("connected"));
		}
	}

	addEventListener() {}

	close() {
		this.connectionState = "closed";
		for (const channel of this.channels) channel.close();
	}

	private setConnectionState(state: RTCPeerConnectionState) {
		this.connectionState = state;
		this.onconnectionstatechange?.();
	}
}

/** Delivers what it sends to its peer a microtask later, counting undelivered bytes as buffered. */
class FakeDataChannel extends EventTarget {
	static created: FakeDataChannel[] = [];

	readyState: RTCDataChannelState = "connecting";
	binaryType = "blob";
	bufferedAmount = 0;
	bufferedAmountLowThreshold = 0;
	maxBufferedAmount = 0;
	onopen: (() => void) | null = null;
	onmessage: ((event: { data: unknown }) => void) | null = null;
	peer: FakeDataChannel | null = null;
	sentMessages: Array<{ type: string; id?: string }> = [];
	sentChunkSizes: number[] = [];

	readonly label: string;
	readonly isOfferer: boolean;

	constructor(label: string, isOfferer: boolean) {
		super();
		this.label = label;
		this.isOfferer = isOfferer;
		FakeDataChannel.created.push(this);
	}

	open() {
		this.readyState = "open";
		this.onopen?.();
	}

	close() {
		this.readyState = "closed";
		this.dispatchEvent(new Event("close"));
	}

	send(data: string | Uint8Array) {
		if (this.readyState !== "open") throw new Error("Channel not open");

		if (typeof data === "string") {
			this.sentMessages.push(JSON.parse(data));
			queueMicrotask(() => this.peer?.onmessage?.({ data }));
			return;
		}

		const chunk = data.slice().buffer;
		this.sentChunkSizes.push(chunk.byteLength);
		this.bufferedAmount += chunk.byteLength;
		this.maxBufferedAmount = Math.max(
			this.maxBufferedAmount,
			this.bufferedAmount,
		);
		queueMicrotask(() => {
			const before = this.bufferedAmount;
			this.bufferedAmount -= chunk.byteLength;
			if (
				before > this.bufferedAmountLowThreshold &&
				this.bufferedAmount <= this.bufferedAmountLowThreshold
			) {
				this.dispatchEvent(new Event("bufferedamountlow"));
			}
			this.peer?.onmessage?.({ data: chunk });
		});
	}
}
