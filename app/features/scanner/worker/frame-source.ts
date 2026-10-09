/**
 * Sequential decode of a VoD slice for the analyzer, one stream for a lane's
 * whole slice. The stream is every sample in presentation order, but a sample
 * the analyzer has proven it will skip — earlier than its `floor`, a lower
 * bound on the next frame any detector is due for — or that its check plan
 * (check-plan.ts: where each detector's next checks can land) never reaches
 * comes as a bare timestamp: only frames it may analyze are kept open for
 * it. Over calm footage the analyzer `seek`s instead, wanting one sample
 * only: everything before it may go undecoded, the decoder jumping straight
 * to a keyframe at or before it when that lies ahead.
 *
 * Decoding a sample the analyzer does not want is skipped outright where the
 * codec proves it changes nothing later frames decode to (AV1 units that
 * refresh no reference slot, av1-refs.ts) — its bare timestamp still comes
 * in its place. Decoding runs in decode.worker.ts, off the analyzer's thread
 * (demux and decode bookkeeping cost ~0.15 ms a sample, and a 60 fps slice
 * decodes ten samples for every one analyzed); where that worker cannot
 * run, the same stream is decoded on this thread.
 */
import {
	ALL_FORMATS,
	BlobSource,
	type EncodedPacket,
	EncodedPacketSink,
	Input,
	type InputVideoTrack,
	type VideoSample,
	VideoSampleSink,
} from "mediabunny";
import { createAv1UnitClassifier } from "../core/av1-refs";
import {
	type CheckPlan,
	createCheckTracker,
} from "../core/detectors/check-plan";

/**
 * Decoded 1080p frames the stream keeps open for the analyzer at once (more
 * wait for `release`): enough to hold the frames the next two analyses may
 * read; larger pictures get proportionally fewer.
 */
const OPEN_FRAMES_1080P = 24;
const MIN_OPEN_FRAMES = 8;
/** Bare timestamps are sent over in batches of this many (or sooner, before a frame). */
const TIMESTAMP_BATCH = 16;
/** Packets in the decoder at once: few, so whether one is worth decoding is decided late. */
const DECODE_QUEUE_SIZE = 3;
/**
 * A decoder that has taken every packet yet emits nothing for this long
 * needs more in flight to emit at all (frame-threaded software decoders):
 * its allowance grows by one.
 */
const DECODER_STALL_MS = 20;
const MAX_DECODE_DEPTH = 64;
const PACKET_OPTIONS = { verifyKeyPackets: true };

export interface SourceItem {
	t: number;
	/** the decoded frame; null for a sample before the floor */
	frame: VideoFrame | null;
	/** a small thumbnail of this sample for the progress preview */
	preview?: ImageBitmap;
}

export interface FrameSource {
	/** The next sample in presentation order; null once the slice or the media ends. */
	next(): Promise<SourceItem | null>;
	/** Samples before `t` may come without their frame (monotonic: lower values are ignored). */
	floor(t: number): void;
	/** Only the sample at `t` is wanted next: the ones before it may not come at all. */
	seek(t: number): void;
	/** Only samples `plan` lets through may be analyzed (null: any); a seek drops it. */
	plan(plan: CheckPlan | null): void;
	/** `item`'s frame is closed or handed on, making room for another. */
	release(item: SourceItem): void;
	/** Ends the stream; its unread frames are closed. */
	close(): void;
}

export interface PreviewOptions {
	intervalMs: number;
	width: number;
	height: number;
}

export type DecodeRequest =
	| {
			kind: "open";
			session: number;
			file: File;
			/** first sample at or before this time, as VideoSampleSink.samples(start) */
			start: number;
			/** the stream ends at the first sample at or past this time */
			end: number;
			preview: PreviewOptions;
			hardwareAcceleration: HardwareAcceleration;
	  }
	| { kind: "floor"; session: number; t: number }
	| { kind: "seek"; session: number; t: number }
	| { kind: "plan"; session: number; plan: CheckPlan | null }
	| { kind: "release"; session: number }
	| { kind: "close"; session: number };

export type DecodeResponse =
	| {
			kind: "items";
			session: number;
			items: SourceItem[];
			/** the stream is over after these items */
			end: boolean;
	  }
	| { kind: "error"; session: number; message: string }
	/** sent once the worker has loaded */
	| { kind: "ready" };

/** What a pump reads of the stream's consumer, and hands it. */
export interface PumpControl {
	floor: () => number;
	/** the time a `seek` asked for, -Infinity before any */
	seekT: () => number;
	/** the latest check plan, null when none holds */
	plan: () => CheckPlan | null;
	open: () => number;
	stopped: () => boolean;
	/** resolves on a release, a seek or a stop */
	waitForRoom: () => Promise<void>;
	deliver: (items: SourceItem[], end: boolean) => void;
}

/** The decoder mediabunny's sinks drive, reached for so packets can be left out. */
interface SampleDecoder {
	decode(packet: EncodedPacket): void;
	flush(): Promise<void>;
	close(): void;
	getDecodeQueueSize(): number;
}

type CreateDecoder = (
	onSample: (sample: VideoSample) => void,
	onError: (error: Error) => void,
) => Promise<SampleDecoder>;

/** A sample on its way out: its place in the stream is known before its picture is. */
interface Pending {
	t: number;
	state: "decoding" | "previewing" | "ready";
	item: SourceItem;
	/** a detector pass may run on it */
	wanted: boolean;
}

/**
 * Decodes `[start, end)` of `track` in stream order under `control`. Shared by
 * the decode worker and the on-thread fallback.
 */
export async function pumpFrames({
	track,
	start,
	end,
	preview,
	hardwareAcceleration,
	control,
}: {
	track: InputVideoTrack;
	start: number;
	end: number;
	preview: PreviewOptions;
	hardwareAcceleration: HardwareAcceleration;
	control: PumpControl;
}): Promise<void> {
	const sink = new VideoSampleSink(track, { hardwareAcceleration });
	const maxOpen = await maxOpenFrames(track);
	const resolution = await track.getTimeResolution();
	/** a packet's timestamp as its decoded sample carries it */
	const roundT = (t: number) => Math.round(t * resolution) / resolution;
	const endT = roundT(end);
	const createDecoder = (sink as unknown as { _createDecoder?: CreateDecoder })
		._createDecoder;
	if (typeof createDecoder !== "function") {
		// mediabunny moved its internals: decode every packet through the public stream
		await pumpSamples({
			samples: sink.samples(start),
			end: endT,
			maxOpen,
			preview,
			control,
		});
		return;
	}
	const codec = await track.getCodec();
	// one shown frame per packet, in presentation order; elsewhere (B-frames,
	// invisible frames) every packet is decoded and samples go out as the
	// decoder emits them
	const inDecodeOrder = codec === "av1";
	const changesState =
		codec === "av1" ? await av1UnitClassifier(track) : () => true;
	const packets = new EncodedPacketSink(track);
	const firstPacket = await packets.getPacket(start, PACKET_OPTIONS);
	const firstT = firstPacket
		? roundT(firstPacket.timestamp)
		: Number.NEGATIVE_INFINITY;

	const pending: Pending[] = [];
	let batch: SourceItem[] = [];
	let ended = false;
	let failure: Error | null = null;
	let lastPreviewAt = Number.NEGATIVE_INFINITY;
	const previews = new Set<Promise<void>>();
	/** packets the decoder may hold undecided, raised for decoders that need more */
	let depth = DECODE_QUEUE_SIZE;
	let emitted = 0;
	let wakeFeeder: (() => void) | null = null;
	const wake = () => {
		wakeFeeder?.();
		wakeFeeder = null;
	};
	const flushBatch = (last: boolean) => {
		if (batch.length > 0 || last) control.deliver(batch, last);
		batch = [];
	};
	/** Hands on the samples whose pictures are in, in stream order. */
	const emitReady = () => {
		while (pending.length > 0 && pending[0]!.state === "ready") {
			const { item } = pending.shift()!;
			if (ended || item.t < firstT || item.t >= endT || control.stopped()) {
				if (item.t >= endT) ended = true;
				item.frame?.close();
				item.preview?.close();
				continue;
			}
			batch.push(item);
			if (item.frame || batch.length >= TIMESTAMP_BATCH) flushBatch(false);
		}
	};
	const settle = (entry: Pending, sample: VideoSample) => {
		const { t } = entry;
		const keep =
			entry.wanted && t >= control.floor() && t >= control.seekT() && !ended;
		const now = performance.now();
		const wantsPreview = now - lastPreviewAt >= preview.intervalMs;
		if (wantsPreview) lastPreviewAt = now;
		if (keep) entry.item.frame = sample.toVideoFrame();
		if (!wantsPreview) {
			sample.close();
			entry.state = "ready";
			return;
		}
		entry.state = "previewing";
		const frame = sample.toVideoFrame();
		sample.close();
		const made = createImageBitmap(frame, {
			resizeWidth: preview.width,
			resizeHeight: preview.height,
		})
			.then(
				(bitmap) => {
					entry.item.preview = bitmap;
				},
				() => {},
			)
			.finally(() => {
				frame.close();
				entry.state = "ready";
				previews.delete(made);
				emitReady();
			});
		previews.add(made);
	};
	const decoder = await createDecoder.call(
		sink,
		(sample) => {
			emitted++;
			const t = roundT(sample.timestamp);
			let entry: Pending | undefined;
			if (inDecodeOrder) {
				entry = pending.find((p) => p.state === "decoding");
			} else {
				entry = {
					t,
					state: "decoding",
					item: { t, frame: null },
					wanted: true,
				};
				pending.push(entry);
			}
			if (!entry || entry.t !== t) {
				sample.close();
				failure ??= new Error(`decoder emitted ${t} out of order`);
				wake();
				return;
			}
			settle(entry, sample);
			emitReady();
			wake();
		},
		(error) => {
			failure ??= error;
			wake();
		},
	);

	const iterate = (from: EncodedPacket | null) =>
		from ? packets.packets(from, undefined, PACKET_OPTIONS) : null;
	const tracker = createCheckTracker();
	let plan: CheckPlan | null = null;
	let iterator = iterate(
		(await packets.getKeyPacket(start, PACKET_OPTIONS)) ??
			(await packets.getFirstKeyPacket(PACKET_OPTIONS)),
	);
	try {
		let packet = (await iterator?.next())?.value ?? null;
		while (packet && !control.stopped() && !ended) {
			if (failure) throw failure;
			let decoding = 0;
			for (const entry of pending) if (entry.state === "decoding") decoding++;
			const queued = decoder.getDecodeQueueSize();
			const room =
				decoding < depth &&
				queued < DECODE_QUEUE_SIZE &&
				control.open() < maxOpen;
			if (!room) {
				flushBatch(false);
				const emittedBefore = emitted;
				const decoderBound = decoding >= depth || queued >= DECODE_QUEUE_SIZE;
				await Promise.race([
					new Promise<void>((resolve) => {
						wakeFeeder = resolve;
					}),
					control.waitForRoom(),
					...(decoderBound
						? [new Promise((resolve) => setTimeout(resolve, DECODER_STALL_MS))]
						: []),
				]);
				if (
					emitted === emittedBefore &&
					decoding >= depth &&
					decoder.getDecodeQueueSize() === 0 &&
					depth < MAX_DECODE_DEPTH &&
					!failure
				) {
					depth++;
				}
				continue;
			}
			const seekT = control.seekT();
			if (seekT > packet.timestamp) {
				const key = await packets.getKeyPacket(seekT, PACKET_OPTIONS);
				if (key && key.sequenceNumber > packet.sequenceNumber) {
					await decoder.flush();
					emitReady();
					await iterator?.return(undefined);
					tracker.clear();
					iterator = iterate(key);
					packet = (await iterator?.next())?.value ?? null;
					continue;
				}
			}
			const t = roundT(packet.timestamp);
			if (inDecodeOrder && t >= endT) break;
			if (control.plan() !== plan) {
				plan = control.plan();
				tracker.setPlan(plan);
				for (const entry of pending) {
					if (entry.state === "decoding")
						entry.wanted = tracker.wanted(entry.t);
				}
			}
			const wanted = !inDecodeOrder || tracker.step(t);
			const skip =
				inDecodeOrder &&
				!changesState(packet.data) &&
				(t < control.floor() || t < seekT || !wanted);
			if (inDecodeOrder) {
				pending.push({
					t,
					state: skip ? "ready" : "decoding",
					item: { t, frame: null },
					wanted,
				});
			}
			if (!skip) decoder.decode(packet);
			emitReady();
			packet = (await iterator?.next())?.value ?? null;
		}
		await iterator?.return(undefined);
		if (!control.stopped()) await decoder.flush();
		await Promise.all(previews);
		if (failure) throw failure;
		emitReady();
		flushBatch(true);
	} finally {
		decoder.close();
		await iterator?.return(undefined);
		for (const { item } of pending) {
			item.frame?.close();
			item.preview?.close();
		}
	}
}

/** How many decoded frames of `track` a stream keeps open at once. */
export async function maxOpenFrames(track: InputVideoTrack): Promise<number> {
	const pixels =
		(await track.getDisplayWidth()) * (await track.getDisplayHeight());
	return Math.max(
		MIN_OPEN_FRAMES,
		Math.min(
			OPEN_FRAMES_1080P,
			Math.floor((OPEN_FRAMES_1080P * 1920 * 1080) / Math.max(1, pixels)),
		),
	);
}

async function av1UnitClassifier(
	track: InputVideoTrack,
): Promise<(unit: Uint8Array) => boolean> {
	const config = await track.getDecoderConfig();
	const description = config?.description;
	const av1C = !description
		? undefined
		: ArrayBuffer.isView(description)
			? new Uint8Array(
					description.buffer,
					description.byteOffset,
					description.byteLength,
				)
			: new Uint8Array(description);
	// av1C: 4 bytes of fields, then the config OBUs
	return createAv1UnitClassifier(av1C?.subarray(4));
}

/** Every sample of `samples` in order, frames from the floor on: the stream without skipping or seeking. */
async function pumpSamples({
	samples,
	end,
	maxOpen,
	preview,
	control,
}: {
	samples: AsyncIterable<VideoSample | null>;
	end: number;
	maxOpen: number;
	preview: PreviewOptions;
	control: PumpControl;
}): Promise<void> {
	let batch: SourceItem[] = [];
	let lastPreviewAt = Number.NEGATIVE_INFINITY;
	const wanted = () => Math.max(control.floor(), control.seekT());
	for await (const sample of samples) {
		if (control.stopped()) {
			sample?.close();
			return;
		}
		if (!sample) continue;
		const t = sample.timestamp;
		if (t >= end) {
			sample.close();
			break;
		}
		const item: SourceItem = { t, frame: null };
		const now = performance.now();
		if (now - lastPreviewAt >= preview.intervalMs) {
			lastPreviewAt = now;
			const frame = sample.toVideoFrame();
			item.preview = await createImageBitmap(frame, {
				resizeWidth: preview.width,
				resizeHeight: preview.height,
			});
			frame.close();
		}
		if (t >= wanted()) {
			while (control.open() >= maxOpen && !control.stopped()) {
				control.deliver(batch, false);
				batch = [];
				await control.waitForRoom();
			}
			if (control.stopped()) {
				sample.close();
				item.preview?.close();
				return;
			}
			// the floor may have risen while decoding waited
			if (t >= wanted()) item.frame = sample.toVideoFrame();
		}
		sample.close();
		batch.push(item);
		if (item.frame || batch.length >= TIMESTAMP_BATCH) {
			control.deliver(batch, false);
			batch = [];
		}
	}
	control.deliver(batch, true);
}

/** Decodes `[start, end)` of `file` in decode.worker.ts, or on this thread if the worker is unavailable. */
export function openFrameSource(
	worker: Worker | null,
	file: File,
	start: number,
	end: number,
	preview: PreviewOptions,
	hardwareAcceleration: HardwareAcceleration,
): FrameSource {
	return worker
		? workerSource(worker, file, start, end, preview, hardwareAcceleration)
		: localSource(file, start, end, preview, hardwareAcceleration);
}

let nextSession = 0;

/** A stream fed by decode.worker.ts messages. */
function workerSource(
	worker: Worker,
	file: File,
	start: number,
	end: number,
	preview: PreviewOptions,
	hardwareAcceleration: HardwareAcceleration,
): FrameSource {
	const session = nextSession++;
	const queue: SourceItem[] = [];
	let ended = false;
	let failure: Error | null = null;
	let waiter: (() => void) | null = null;
	let floor = Number.NEGATIVE_INFINITY;
	let seekT = Number.NEGATIVE_INFINITY;
	let closed = false;
	const onMessage = (e: MessageEvent<DecodeResponse>) => {
		const response = e.data;
		if (response.kind === "ready" || response.session !== session) return;
		if (closed) {
			// sent before the worker saw the close
			if (response.kind === "items") closeItems(response.items);
			else worker.removeEventListener("message", onMessage);
			return;
		}
		if (response.kind === "error") failure = new Error(response.message);
		else {
			queue.push(...response.items);
			if (response.end) ended = true;
		}
		waiter?.();
		waiter = null;
	};
	const onError = () => {
		failure ??= new Error("decode worker failed");
		waiter?.();
		waiter = null;
	};
	worker.addEventListener("message", onMessage);
	worker.addEventListener("error", onError);
	const send = (request: DecodeRequest) => worker.postMessage(request);
	send({
		kind: "open",
		session,
		file,
		start,
		end,
		preview,
		hardwareAcceleration,
	});
	return {
		async next() {
			while (queue.length === 0 && !ended && !failure) {
				await new Promise<void>((resolve) => {
					waiter = resolve;
				});
			}
			if (failure) throw failure;
			return queue.shift() ?? null;
		},
		floor(t) {
			if (t <= floor) return;
			floor = t;
			send({ kind: "floor", session, t });
		},
		seek(t) {
			if (t <= seekT) return;
			seekT = t;
			send({ kind: "seek", session, t });
		},
		plan(plan) {
			send({ kind: "plan", session, plan });
		},
		release() {
			send({ kind: "release", session });
		},
		close() {
			closed = true;
			worker.removeEventListener("error", onError);
			closeItems(queue.splice(0));
			// a finished session sends nothing more; a running one acknowledges the close
			if (ended || failure) worker.removeEventListener("message", onMessage);
			else send({ kind: "close", session });
		},
	};
}

function closeItems(items: SourceItem[]): void {
	for (const item of items) {
		item.frame?.close();
		item.preview?.close();
	}
}

/** The same stream decoded on this thread. */
function localSource(
	file: File,
	start: number,
	end: number,
	preview: PreviewOptions,
	hardwareAcceleration: HardwareAcceleration,
): FrameSource {
	const input = new Input({
		formats: ALL_FORMATS,
		source: new BlobSource(file),
	});
	const queue: SourceItem[] = [];
	let ended = false;
	let stopped = false;
	let failure: Error | null = null;
	let floor = Number.NEGATIVE_INFINITY;
	let seekT = Number.NEGATIVE_INFINITY;
	let plan: CheckPlan | null = null;
	let open = 0;
	let waiter: (() => void) | null = null;
	let room: (() => void) | null = null;
	const wake = () => {
		waiter?.();
		waiter = null;
	};
	const wakeRoom = () => {
		room?.();
		room = null;
	};
	void (async () => {
		const track = await input.getPrimaryVideoTrack();
		if (!track) throw new Error("no video track");
		await pumpFrames({
			track,
			start,
			end,
			preview,
			hardwareAcceleration,
			control: {
				floor: () => floor,
				seekT: () => seekT,
				plan: () => plan,
				open: () => open,
				stopped: () => stopped,
				waitForRoom: () =>
					new Promise<void>((resolve) => {
						room = resolve;
					}),
				deliver: (items, last) => {
					for (const item of items) if (item.frame) open++;
					queue.push(...items);
					if (last) ended = true;
					wake();
				},
			},
		});
	})()
		.catch((error) => {
			failure = error instanceof Error ? error : new Error(String(error));
			wake();
		})
		.finally(() => input.dispose());
	return {
		async next() {
			while (queue.length === 0 && !ended && !failure) {
				await new Promise<void>((resolve) => {
					waiter = resolve;
				});
			}
			if (failure) throw failure;
			return queue.shift() ?? null;
		},
		floor(t) {
			floor = Math.max(floor, t);
		},
		seek(t) {
			seekT = Math.max(seekT, t);
			plan = null;
			wakeRoom();
		},
		plan(next) {
			plan = next;
		},
		release() {
			open--;
			wakeRoom();
		},
		close() {
			stopped = true;
			wakeRoom();
			closeItems(queue.splice(0));
		},
	};
}
