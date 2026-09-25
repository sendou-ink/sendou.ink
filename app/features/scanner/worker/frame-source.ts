/**
 * Dense sequential decode of a VoD slice for the analyzer's active mode. The
 * stream is every sample in presentation order, but a sample the analyzer has
 * proven it will skip — earlier than its `floor`, a lower bound on the next
 * frame any detector is due for — comes as a bare timestamp: only frames at
 * or past the floor are kept open for it. Decoding runs in decode.worker.ts,
 * off the analyzer's thread (demux and decode bookkeeping cost ~0.15 ms a
 * sample, and a 60 fps slice decodes ten samples for every one analyzed);
 * where that worker cannot run, the same stream is decoded on this thread.
 */
import {
	ALL_FORMATS,
	BlobSource,
	Input,
	type VideoSample,
	VideoSampleSink,
} from "mediabunny";

/** Decoded frames the stream keeps open for the analyzer at once; more wait for `release`. */
export const MAX_OPEN_FRAMES = 8;
/** Bare timestamps are sent over in batches of this many (or sooner, before a frame). */
const TIMESTAMP_BATCH = 16;

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
	/** A frame the stream sent is closed or handed on, making room for another. */
	release(): void;
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
	  }
	| { kind: "floor"; session: number; t: number }
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

/**
 * Pulls samples from `samples` in order, keeping frames from the floor on;
 * `deliver` gets the items batched, `waitForRoom` holds decoding while
 * MAX_OPEN_FRAMES frames are out. Shared by the decode worker and the
 * on-thread fallback.
 */
export async function pumpSamples({
	samples,
	end,
	preview,
	floor,
	open,
	stopped,
	waitForRoom,
	deliver,
}: {
	samples: AsyncIterable<VideoSample | null>;
	end: number;
	preview: PreviewOptions;
	floor: () => number;
	open: () => number;
	stopped: () => boolean;
	waitForRoom: () => Promise<void>;
	deliver: (items: SourceItem[], end: boolean) => void;
}): Promise<void> {
	let batch: SourceItem[] = [];
	let lastPreviewAt = Number.NEGATIVE_INFINITY;
	for await (const sample of samples) {
		if (stopped()) {
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
		if (t >= floor()) {
			if (open() >= MAX_OPEN_FRAMES) {
				deliver(batch, false);
				batch = [];
				await waitForRoom();
				if (stopped()) {
					sample.close();
					item.preview?.close();
					return;
				}
			}
			// the floor may have risen while decoding waited
			if (t >= floor()) item.frame = sample.toVideoFrame();
		}
		sample.close();
		batch.push(item);
		if (item.frame || batch.length >= TIMESTAMP_BATCH) {
			deliver(batch, false);
			batch = [];
		}
	}
	deliver(batch, true);
}

/** Decodes `[start, end)` of `file` in decode.worker.ts, or on this thread if the worker is unavailable. */
export function openFrameSource(
	worker: Worker | null,
	file: File,
	start: number,
	end: number,
	preview: PreviewOptions,
): FrameSource {
	return worker
		? workerSource(worker, file, start, end, preview)
		: localSource(file, start, end, preview);
}

let nextSession = 0;

/** A stream fed by decode.worker.ts messages. */
function workerSource(
	worker: Worker,
	file: File,
	start: number,
	end: number,
	preview: PreviewOptions,
): FrameSource {
	const session = nextSession++;
	const queue: SourceItem[] = [];
	let ended = false;
	let failure: Error | null = null;
	let waiter: (() => void) | null = null;
	let floor = Number.NEGATIVE_INFINITY;
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
	send({ kind: "open", session, file, start, end, preview });
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
	let open = 0;
	let waiter: (() => void) | null = null;
	let room: (() => void) | null = null;
	const wake = () => {
		waiter?.();
		waiter = null;
	};
	void (async () => {
		const track = await input.getPrimaryVideoTrack();
		if (!track) throw new Error("no video track");
		await pumpSamples({
			samples: new VideoSampleSink(track).samples(start),
			end,
			preview,
			floor: () => floor,
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
		release() {
			open--;
			room?.();
			room = null;
		},
		close() {
			stopped = true;
			room?.();
			room = null;
			closeItems(queue.splice(0));
		},
	};
}
