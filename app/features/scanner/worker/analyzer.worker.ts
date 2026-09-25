/**
 * AnalyzerWorker: owns OpenCV.js (WASM), the detector registry and a
 * DetectorScheduler. "frame": the main thread posts one ImageBitmap/VideoFrame
 * at a time; results come back per detector, then a "done" with the calm
 * signal and telemetry. "scanChunk": the worker scans a contiguous VoD slice
 * itself, so scheduling is exact, undue frames skip readback, and calm
 * stretches skim by keyframe hops — the big VoD speedup, since sequential
 * decode bounds scan time. Two helper workers keep the waits off this
 * thread: decode.worker.ts decodes the dense stretches (frame-source.ts) and
 * readback.worker.ts reads frames back while this thread runs the detectors
 * on the previous one (see scanActive).
 */
import {
	ALL_FORMATS,
	BlobSource,
	EncodedPacketSink,
	Input,
	type VideoSample,
	VideoSampleSink,
} from "mediabunny";
import type { Mat } from "../core/cv";
import { loadOpenCV } from "../core/cv";
import { runDetectorPass } from "../core/detectors/frame-pass";
import { MAP_START_EVENT_TYPE } from "../core/detectors/map-start/index";
import {
	createAllDetectors,
	SCOREBOARD_EVENT_TYPES,
} from "../core/detectors/registry";
import { DetectorScheduler } from "../core/detectors/scheduler";
import {
	createScanTelemetry,
	type ScanTelemetry,
} from "../core/detectors/telemetry";
import type { Detector } from "../core/detectors/types";
import { type FrameData, normalizeFrame, toMat } from "../core/image";
import { TimelineBuilder } from "../core/timeline/index";
import {
	MAX_OPEN_FRAMES,
	openFrameSource,
	type SourceItem,
} from "./frame-source";
import { createGpuFrameScaler, type GpuFrameScaler } from "./gpu-frame-scaler";
import { createGpuMatcher, type GpuMatcher } from "./gpu-matcher";
import type {
	AnalyzeRequest,
	InitRequest,
	ScanChunkRequest,
	WorkerRequest,
	WorkerResponse,
} from "./protocol";
import {
	createCanvasReadback,
	createFrameReader,
	type FrameReader,
} from "./readback";
import { fetchScoreboardResources } from "./resources";

/** Widest skim hop, so long-GOP recordings can't slip a results screen (~10s) or intro (~7s) between samples. */
const MAX_SKIM_STRIDE_S = 2.5;
const PROGRESS_POST_INTERVAL_MS = 400;
const PREVIEW_POST_INTERVAL_MS = 600;
const PREVIEW_WIDTH = 480;
const PREVIEW_HEIGHT = 270;

/** A read-back frame normalized to the canonical size, its capture pixels kept for the PNG. */
interface PreparedFrame {
	pixels: FrameData;
	frame: Mat;
}

/** A decoded VoD sample awaiting its step. */
interface Pulled extends SourceItem {
	/** its readback and normalization, started ahead when it looked likely to be analyzed */
	read: Promise<PreparedFrame> | null;
}

let detectors: Detector<unknown>[] = [];
let gpuMatcher: GpuMatcher | null = null;
let gpuScaler: GpuFrameScaler | null = null;
let scheduler: DetectorScheduler | null = null;
/** null unless the init message asked for telemetry */
let telemetry: ScanTelemetry | null = null;
let collectTelemetry = false;
let chunkAborted = false;
/** last per-frame t, to reset telemetry when a new session rewinds the clock */
let lastFrameT = Number.NEGATIVE_INFINITY;
/**
 * Mirror of the main thread's timeline (same defaults), fed every event first:
 * a frame is PNG-encoded only when some event would be listed rather than
 * merged into an earlier read — a fixed-cadence detector re-reads a standing
 * screen twice a second, and encoding 1080p for each repeat cost more than
 * the parse.
 */
let shadowTimeline = new TimelineBuilder();
/** Canvas readback on this thread: live frames, and the reader's fallback. */
const readFrame = createCanvasReadback();
/** VoD scans read frames back in a helper worker, overlapping the detector passes. */
let frameReader: FrameReader | null = null;
/** VoD scans decode their dense stretches in a helper worker, once it has booted; null where it cannot run. */
let decoder: Promise<Worker | null> | null = null;
/** the last normalization queued: they run one at a time, as the GPU scaler reuses its buffers */
let normalizing: Promise<unknown> = Promise.resolve();

function post(message: WorkerResponse, transfer: Transferable[] = []): void {
	self.postMessage(message, { transfer });
}

async function init({
	assetsBaseUrl,
	suppressSteadyFrames = true,
	collectTelemetry: collect = false,
	webgpu = false,
}: InitRequest): Promise<void> {
	// VoD scans need the helper workers: start them booting alongside init
	if (typeof VideoDecoder !== "undefined") {
		void decodeWorker();
		frameReader ??= createFrameReader(readFrame);
	}
	try {
		await loadOpenCV();
		if (webgpu && navigator.gpu) {
			gpuMatcher = await createGpuMatcher(navigator.gpu).catch((error) => {
				// biome-ignore lint/suspicious/noConsole: a missing GPU silently costs speed, so say why
				console.warn("scanner: WebGPU unavailable, matching on the CPU", error);
				return null;
			});
			if (gpuMatcher) {
				gpuScaler = await createGpuFrameScaler(gpuMatcher.device).catch(
					() => null,
				);
			}
		}
		const resources = await fetchScoreboardResources(assetsBaseUrl);
		detectors = createAllDetectors(resources);
		scheduler = new DetectorScheduler(detectors, {
			suppressSteadyFrames,
			matchOpeningTypes: [MAP_START_EVENT_TYPE],
			matchClosingTypes: SCOREBOARD_EVENT_TYPES,
		});
		collectTelemetry = collect;
		telemetry = freshTelemetry();
		post({ kind: "ready" });
	} catch (error) {
		post({ kind: "error", message: `init failed: ${String(error)}` });
	}
}

/** Runs the due detectors over one frame; closes `bitmap`. Readback and normalize are skipped when nothing is due. */
async function analyzeFrame(
	bitmap: ImageBitmap | VideoFrame,
	t: number,
): Promise<void> {
	const due = scheduler!.dueDetectors(t);
	if (due.length === 0) {
		bitmap.close();
		return;
	}
	const pixels = readFrame(bitmap);
	await analyzePrepared(await prepareFrame(pixels), t, due);
}

/** Normalizes read-back pixels (caller owns the frame), after any normalization already queued. */
function prepareFrame(pixels: FrameData): Promise<PreparedFrame> {
	const prepared = normalizing.then(async () => {
		const src = toMat(pixels);
		try {
			const frame =
				gpuScaler && gpuRunner()
					? await gpuScaler.normalize(src)
					: normalizeFrame(src);
			return { pixels, frame };
		} finally {
			src.delete();
		}
	});
	normalizing = prepared.catch(() => {});
	return prepared;
}

/**
 * Gates and parses one prepared frame for the `due` detectors, posts the
 * results and deletes the frame; `onGated` sees the parsing detectors once
 * every gate is recorded.
 */
async function analyzePrepared(
	{ pixels, frame }: PreparedFrame,
	t: number,
	due: readonly string[],
	onGated?: (parsing: readonly string[]) => void,
): Promise<void> {
	if (telemetry) telemetry.analyzedFrames++;

	// ship back the exact analyzed pixels (lossless, capture resolution) so the
	// UI never re-grabs a later frame — encoded at most once per frame
	let encoded: Promise<Blob> | null = null;
	const frameBlob = () => {
		encoded ??= encodePng(pixels);
		return encoded;
	};

	try {
		const outcomes = await runDetectorPass({
			frame,
			t,
			detectors,
			due,
			scheduler: scheduler!,
			telemetry,
			runSteps: gpuRunner(),
			onGated,
		});
		for (const { detector, gate, events } of outcomes) {
			let listed = false;
			for (const event of events) {
				const { action } = shadowTimeline.push(event);
				if (action === "added" || action === "replaced") listed = true;
			}
			const blob =
				listed && detector.attachFrame !== false
					? await frameBlob()
					: undefined;
			post({
				kind: "result",
				detector: detector.id,
				t,
				gate,
				events,
				frame: blob,
			});
		}
	} finally {
		frame.delete();
	}
}

async function analyze({ bitmap, t }: AnalyzeRequest): Promise<void> {
	if (t + 5 < lastFrameT) {
		telemetry = freshTelemetry();
		shadowTimeline = new TimelineBuilder();
	}
	lastFrameT = t;
	try {
		await analyzeFrame(bitmap, t);
	} catch (error) {
		post({ kind: "error", message: `analyze failed: ${String(error)}` });
	}
	post({ kind: "done", t, calm: scheduler!.calm(t), telemetry });
}

async function scanChunk({
	file,
	chunkIndex,
	tStart,
	tEnd,
}: ScanChunkRequest): Promise<void> {
	chunkAborted = false;
	scheduler!.reset(tStart);
	telemetry = freshTelemetry();
	shadowTimeline = new TimelineBuilder();
	const wallStart = performance.now();
	const gpuWaitStart = gpuMatcher?.stats.gpuWaitMs ?? 0;
	let lastProgressAt = 0;
	let lastPreviewAt = 0;
	let cursor = tStart;
	let mode: "active" | "skim" = "active";

	const input = new Input({
		formats: ALL_FORMATS,
		source: new BlobSource(file),
	});
	try {
		const track = await input.getPrimaryVideoTrack();
		if (!track || !(await track.canDecode())) {
			throw new Error("worker cannot decode this file");
		}
		const samples = new VideoSampleSink(track);
		const packets = new EncodedPacketSink(track);

		frameReader ??= createFrameReader(readFrame);
		const reader = frameReader;

		/** A skimmed sample as a frame, plus a preview thumbnail every PREVIEW_POST_INTERVAL_MS. */
		const pull = async (sample: VideoSample) => {
			const t = sample.timestamp;
			const frame = sample.toVideoFrame();
			sample.close();
			let preview: ImageBitmap | undefined;
			const now = performance.now();
			if (now - lastPreviewAt >= PREVIEW_POST_INTERVAL_MS) {
				lastPreviewAt = now;
				preview = await createImageBitmap(frame, {
					resizeWidth: PREVIEW_WIDTH,
					resizeHeight: PREVIEW_HEIGHT,
				});
			}
			return { t, frame, preview };
		};
		/** A sample's place in the stream: telemetry and the cursor. */
		const account = (t: number) => {
			if (telemetry) {
				telemetry.decodedFrames++;
				const span = Math.max(0, t - cursor);
				if (mode === "active") telemetry.activeVideoS += span;
				else telemetry.skimVideoS += span;
			}
			cursor = Math.max(cursor, t);
		};
		const report = (preview: ImageBitmap | undefined) => {
			const now = performance.now();
			if (!preview && now - lastProgressAt < PROGRESS_POST_INTERVAL_MS) return;
			lastProgressAt = now;
			if (telemetry) telemetry.wallMs = now - wallStart;
			post(
				{
					kind: "chunkProgress",
					chunkIndex,
					t: cursor,
					mode,
					telemetry,
					preview,
				},
				preview ? [preview] : [],
			);
		};
		const readAndAnalyze = async (frame: VideoFrame, t: number) => {
			const due = scheduler!.dueDetectors(t);
			if (due.length === 0) {
				frame.close();
				return;
			}
			await analyzePrepared(
				await reader.read(frame).then(prepareFrame),
				t,
				due,
			);
		};

		/**
		 * Dense decode from the cursor until the scan turns calm ("calm") or the
		 * chunk or media ends ("end"). Samples take their steps strictly in
		 * stream order — bookkeeping, analysis when due, the calm check — each
		 * against the scheduler state the previous analysis left, exactly as
		 * one frame at a time. What overlaps is only the wait: while a
		 * detector pass runs (much of it awaiting the GPU), the following
		 * samples are decoded and held, those certainly not due (before the
		 * pass's lower bound on the next due time) released, and the one most
		 * likely due read back in the helper worker.
		 */
		const scanActive = async (): Promise<"calm" | "end"> => {
			const source = openFrameSource(await decodeWorker(), file, cursor, tEnd, {
				intervalMs: PREVIEW_POST_INTERVAL_MS,
				width: PREVIEW_WIDTH,
				height: PREVIEW_HEIGHT,
			});
			let upcoming: Promise<SourceItem | null> | null = null;
			let exhausted = false;
			/** decoded, stream order, steps not taken yet */
			const queue: Pulled[] = [];
			const next = async (): Promise<Pulled | null> => {
				upcoming ??= source.next();
				const item = await upcoming;
				upcoming = null;
				if (!item) {
					exhausted = true;
					return null;
				}
				return { ...item, read: null };
			};
			/** Hands the item's frame to the reader: read back and normalized ahead of its step. */
			const readAhead = (item: Pulled) => {
				item.read = reader.read(item.frame!).then(prepareFrame);
				item.frame = null;
				source.release();
			};
			const release = (item: Pulled) => {
				if (item.frame) {
					item.frame.close();
					item.frame = null;
					source.release();
				}
				item.read?.then(
					({ frame }) => frame.delete(),
					() => {},
				);
				item.read = null;
			};

			/** Awaits the frame and runs its pass, reading ahead meanwhile. */
			const analyzeAhead = async (
				prepared: Promise<PreparedFrame>,
				t: number,
				due: readonly string[],
			) => {
				let bound = scheduler!.nextDueLowerBound(t, due);
				let guess = scheduler!.predictNextDueT(t, due);
				source.floor(bound);
				let wake: () => void = () => {};
				let finished = false;
				const done = prepared.then((frame) =>
					analyzePrepared(frame, t, due, (parsing) => {
						bound = scheduler!.nextDueLowerBound(t, parsing);
						guess = bound;
						source.floor(bound);
						wake();
					}),
				);
				done.then(
					() => {
						finished = true;
						wake();
					},
					() => {
						finished = true;
						wake();
					},
				);
				while (!finished) {
					for (const item of queue) if (item.t < bound) release(item);
					const held = queue.filter((item) => item.frame || item.read);
					if (!held.some((item) => item.read)) {
						const likely = held.find((item) => item.t >= guess);
						if (likely) readAhead(likely);
					}
					const pulling =
						!exhausted &&
						held.length < MAX_OPEN_FRAMES &&
						!held.some((item) => item.read) &&
						queue.every((item) => item.t < tEnd);
					const woken = new Promise<void>((resolve) => {
						wake = resolve;
					});
					if (!pulling) {
						await woken;
						continue;
					}
					upcoming ??= source.next();
					if ((await Promise.race([upcoming.then(() => true), woken])) !== true)
						continue;
					const pulled = await next();
					if (pulled) queue.push(pulled);
				}
				await done;
			};

			try {
				for (;;) {
					// every sample before the next due time is certainly skipped
					source.floor(scheduler!.nextDueT());
					const item = queue.shift() ?? (exhausted ? null : await next());
					if (!item) return "end";
					if (chunkAborted || item.t >= tEnd) {
						release(item);
						item.preview?.close();
						return "end";
					}
					account(item.t);
					const due =
						item.t >= scheduler!.nextDueT()
							? scheduler!.dueDetectors(item.t)
							: [];
					if (due.length > 0) {
						if (!item.read) readAhead(item);
						const read = item.read!;
						item.read = null;
						await analyzeAhead(read, item.t, due);
					} else {
						release(item);
					}
					report(item.preview);
					if (scheduler!.calm(cursor)) return "calm";
				}
			} finally {
				for (const item of queue) {
					release(item);
					item.preview?.close();
				}
				source.close();
			}
		};

		while (!chunkAborted && cursor < tEnd) {
			if (mode === "active") {
				// dense sequential decode: every frame is seen, the scheduler
				// decides which are worth analyzing
				if ((await scanActive()) === "end") break;
				mode = "skim";
			} else {
				// skim: hop keyframe to keyframe (single-frame decodes) while
				// calm, capped so long GOPs cannot hide a short screen
				const key = await packets.getKeyPacket(cursor + MAX_SKIM_STRIDE_S, {
					verifyKeyPackets: true,
				});
				const target =
					key && key.timestamp > cursor
						? key.timestamp
						: cursor + MAX_SKIM_STRIDE_S;
				if (target >= tEnd) {
					cursor = tEnd;
					break;
				}
				const sample = await samples.getSample(target);
				if (!sample) {
					cursor = target;
					continue;
				}
				const { t, frame, preview } = await pull(sample);
				account(t);
				if (t >= scheduler!.nextDueT()) await readAndAnalyze(frame, t);
				else frame.close();
				report(preview);
				cursor = Math.max(cursor, target);
				if (!scheduler!.calm(cursor)) mode = "active";
			}
		}

		if (telemetry) {
			telemetry.wallMs = performance.now() - wallStart;
			telemetry.gpuScans = gpuMatcher ? 1 : 0;
			telemetry.gpuWaitMs = (gpuMatcher?.stats.gpuWaitMs ?? 0) - gpuWaitStart;
		}
		post({ kind: "chunkDone", chunkIndex, telemetry });
	} catch (error) {
		post({
			kind: "error",
			message: `chunk ${chunkIndex} scan failed: ${String(error)}`,
		});
	} finally {
		input.dispose();
	}
}

/** The decode worker once it reports ready; null (decode on this thread) when it fails to start. */
function decodeWorker(): Promise<Worker | null> {
	decoder ??= new Promise((resolve) => {
		let worker: Worker;
		try {
			worker = new Worker(new URL("./decode.worker.ts", import.meta.url), {
				type: "module",
			});
		} catch {
			resolve(null);
			return;
		}
		worker.addEventListener("message", () => resolve(worker), { once: true });
		worker.addEventListener(
			"error",
			() => {
				worker.terminate();
				resolve(null);
			},
			{ once: true },
		);
	});
	return decoder;
}

/** The GPU matcher's runner while its device lives; once lost, parses run on the CPU. */
function gpuRunner() {
	if (!gpuMatcher) return undefined;
	if (!gpuMatcher.lost) return gpuMatcher.run;
	// biome-ignore lint/suspicious/noConsole: a lost device silently costs speed, so say so once
	console.warn(
		"scanner: WebGPU device lost, continuing on the CPU",
		gpuMatcher.lostReason,
	);
	gpuMatcher = null;
	gpuScaler = null;
	return undefined;
}

/** PNG of read-back pixels, for the UI's thumbnails and fixture export. */
function encodePng({ width, height, data }: FrameData): Promise<Blob> {
	const canvas = new OffscreenCanvas(width, height);
	canvas
		.getContext("2d")!
		.putImageData(
			new ImageData(data as Uint8ClampedArray<ArrayBuffer>, width, height),
			0,
			0,
		);
	return canvas.convertToBlob({ type: "image/png" });
}

function freshTelemetry(): ScanTelemetry | null {
	return collectTelemetry ? createScanTelemetry() : null;
}

self.onmessage = (e: MessageEvent) => {
	const msg = e.data as WorkerRequest;
	if (msg.kind === "init") void init(msg);
	else if (msg.kind === "frame") void analyze(msg);
	else if (msg.kind === "scanChunk") void scanChunk(msg);
	else if (msg.kind === "abortChunk") chunkAborted = true;
};
