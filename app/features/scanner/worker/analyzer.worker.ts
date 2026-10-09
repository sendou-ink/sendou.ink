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
	type InputVideoTrack,
	VideoSampleSink,
} from "mediabunny";
import {
	CANONICAL_HEIGHT,
	CANONICAL_WIDTH,
	detectContentBox,
} from "../core/canonical";
import { getCV, loadOpenCV, type Mat } from "../core/cv";
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
import {
	type FrameData,
	normalizeFrame,
	provideFrameGray,
	toMat,
} from "../core/image";
import { TimelineBuilder } from "../core/timeline/index";
import { createFrameEncoder } from "./frame-encode";
import {
	type FrameSource,
	maxOpenFrames,
	openFrameSource,
	type SourceItem,
} from "./frame-source";
import { createGpuFrameScaler, type GpuFrameScaler } from "./gpu-frame-scaler";
import {
	createGpuMatcher,
	type GpuMatcher,
	hasFastReadback,
} from "./gpu-matcher";
import type {
	AnalyzeRequest,
	InitRequest,
	ScanChunkRequest,
	WorkerRequest,
	WorkerResponse,
} from "./protocol";
import {
	createCanvasReadback,
	createFrameReaderPool,
	type FrameReader,
	type ReadFrame,
} from "./readback";
import { exactReadbackPath, exactReadbackPathOf } from "./readback-parity";
import { fetchScoreboardResources } from "./resources";

/** Widest skim hop, so long-GOP recordings can't slip a results screen (~10s) or intro (~7s) between samples. */
const MAX_SKIM_STRIDE_S = 2.5;
/**
 * Frames read back ahead of their step at once: each frame the pass in
 * flight can make due next (likeliest first), then the likeliest after it.
 */
const READ_AHEAD = 3;
/**
 * 2160p AV1 is bound by the GPU process's one hardware decode thread, which
 * every lane shares, so every other lane decodes on the CPU (dav1d) instead
 * when there are cores to spare and a readback reads its frames as the
 * canvas reads the hardware's.
 */
const SOFTWARE_LANE_MIN_PIXELS = 3840 * 2160;
const SOFTWARE_LANE_MIN_THREADS = 8;
/** readback workers per analyzer, so reads ahead run side by side */
const READERS = 2;
const PROGRESS_POST_INTERVAL_MS = 400;
const PREVIEW_POST_INTERVAL_MS = 600;
const PREVIEW_WIDTH = 480;
const PREVIEW_HEIGHT = 270;
/**
 * Failures (decode errors, a crashed GPU process taking the hardware decoder
 * down) a chunk scan recovers from by resuming at its cursor before it gives
 * up on the rest of its slice.
 */
const MAX_CHUNK_FAILURES = 10;
/** A crashed GPU process takes a moment to come back. */
const CHUNK_RETRY_DELAY_MS = 1000;
/** Footage hopped over when a spot fails to decode even in software. */
const UNDECODABLE_SKIP_S = 5;

/** A read-back frame normalized to the canonical size, its capture pixels kept for the stored frame. */
interface PreparedFrame {
	pixels: FrameData;
	frame: Mat;
	/** frameGray's conversion, computed with the readback */
	gray?: Uint8Array;
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
let attachFrames = true;
let chunkAborted = false;
/** last per-frame t, to reset telemetry when a new session rewinds the clock */
let lastFrameT = Number.NEGATIVE_INFINITY;
/**
 * Mirror of the main thread's timeline (same defaults), fed every event first:
 * a frame is encoded only when some event would be listed rather than
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
/** analyzed frames' images are encoded in a helper worker, created on the first one */
let encodeFrame: ((pixels: FrameData) => Promise<Blob>) | null = null;
/** the last normalization queued: they run one at a time, as the GPU scaler reuses its buffers */
let normalizing: Promise<unknown> = Promise.resolve();

/**
 * Messages go out in call order; one still awaiting its frame's encode holds
 * back the later ones, never the analysis of the next frame.
 */
let posting: Promise<void> = Promise.resolve();

function post(
	message: WorkerResponse | Promise<WorkerResponse>,
	transfer: Transferable[] = [],
): void {
	posting = posting.then(async () => {
		self.postMessage(await message, { transfer });
	});
}

async function init({
	assetsBaseUrl,
	suppressSteadyFrames = true,
	collectTelemetry: collect = false,
	webgpu = false,
	attachFrames: attach = true,
}: InitRequest): Promise<void> {
	// VoD scans need the helper workers: start them booting alongside init
	if (typeof VideoDecoder !== "undefined") {
		void decodeWorker();
		frameReader ??= createFrameReaderPool(READERS);
	}
	try {
		await loadOpenCV();
		if (webgpu && navigator.gpu) {
			gpuMatcher = await createGpuMatcher(navigator.gpu).catch((error) => {
				// biome-ignore lint/suspicious/noConsole: a missing GPU silently costs speed, so say why
				console.warn("scanner: WebGPU unavailable, matching on the CPU", error);
				return null;
			});
			if (gpuMatcher && !(await hasFastReadback(gpuMatcher.device))) {
				// biome-ignore lint/suspicious/noConsole: a missing GPU silently costs speed, so say why
				console.warn("scanner: WebGPU readback too slow, matching on the CPU");
				gpuMatcher.destroy();
				gpuMatcher = null;
			}
			if (gpuMatcher) {
				gpuScaler = await createGpuFrameScaler(gpuMatcher.device).catch(
					() => null,
				);
			}
		}
		const { resources, missingAtlases, missingIcons } =
			await fetchScoreboardResources(assetsBaseUrl);
		if (missingAtlases.length > 0 || missingIcons.length > 0) {
			// biome-ignore lint/suspicious/noConsole: the scan goes on with what loaded, so say what didn't
			console.warn("scanner: assets failed to load", {
				missingAtlases,
				missingIcons,
			});
		}
		detectors = createAllDetectors(resources);
		scheduler = new DetectorScheduler(detectors, {
			suppressSteadyFrames,
			matchOpeningTypes: [MAP_START_EVENT_TYPE],
			matchClosingTypes: SCOREBOARD_EVENT_TYPES,
		});
		collectTelemetry = collect;
		attachFrames = attach;
		telemetry = freshTelemetry();
		post({ kind: "ready", missingAtlases });
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
function prepareFrame({
	canonical,
	gray,
	...pixels
}: ReadFrame): Promise<PreparedFrame> {
	if (canonical) {
		// normalized along with the readback
		const cv = getCV();
		const frame = new cv.Mat(CANONICAL_HEIGHT, CANONICAL_WIDTH, cv.CV_8UC4);
		frame.data.set(canonical);
		return Promise.resolve({ pixels, frame, gray });
	}
	const prepared = normalizing.then(async () => {
		const src = toMat(pixels);
		// normalizing would only copy it
		if (isCanonical(pixels)) return { pixels, frame: src, gray };
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
	{ pixels, frame, gray }: PreparedFrame,
	t: number,
	due: readonly string[],
	onGated?: (parsing: readonly string[]) => void,
): Promise<void> {
	if (telemetry) telemetry.analyzedFrames++;
	if (gray) provideFrameGray(frame, gray);

	// ship back the exact analyzed pixels (lossless, capture resolution) so the
	// UI never re-grabs a later frame — encoded at most once per frame
	let encoded: Promise<Blob> | null = null;
	const frameBlob = () => {
		encodeFrame ??= createFrameEncoder();
		encoded ??= encodeFrame(pixels);
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
			const result: WorkerResponse = {
				kind: "result",
				detector: detector.id,
				t,
				gate,
				events,
			};
			post(
				attachFrames && listed && detector.attachFrame !== false
					? frameBlob().then(
							(image) => ({ ...result, frame: image }),
							() => result,
						)
					: result,
			);
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
		post({
			kind: "frameError",
			t,
			message: `analyze failed: ${String(error)}`,
		});
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
	scheduler!.reset(tStart, { midStream: tStart > 0 });
	telemetry = freshTelemetry();
	shadowTimeline = new TimelineBuilder();
	const wallStart = performance.now();
	const gpuWaitStart = gpuMatcher?.stats.gpuWaitMs ?? 0;
	let lastProgressAt = 0;
	let lastPreviewAt = 0;
	let cursor = tStart;
	let mode: "active" | "skim" = "active";
	let hardwareAcceleration: HardwareAcceleration = "no-preference";
	let failures = 0;
	let failuresHere = 0;
	let failedAt = Number.NEGATIVE_INFINITY;

	const input = new Input({
		formats: ALL_FORMATS,
		source: new BlobSource(file),
	});
	try {
		const track = await input.getPrimaryVideoTrack();
		if (!track || !(await track.canDecode())) {
			throw new Error("worker cannot decode this file");
		}
		const packets = new EncodedPacketSink(track);

		frameReader ??= createFrameReaderPool(READERS);
		const reader = frameReader;
		const parityT = (tStart + tEnd) / 2;
		let path = await exactReadbackPath(track, parityT, reader);
		if (await decodesInSoftware(track, chunkIndex)) {
			const softwarePath = await exactReadbackPathOf(
				track,
				parityT,
				reader,
				"prefer-software",
			);
			if (softwarePath) {
				hardwareAcceleration = "prefer-software";
				path = softwarePath;
			}
		}
		let samples = new VideoSampleSink(track, { hardwareAcceleration });

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
		const previewOptions = {
			intervalMs: PREVIEW_POST_INTERVAL_MS,
			width: PREVIEW_WIDTH,
			height: PREVIEW_HEIGHT,
		};
		const resolution = await track.getTimeResolution();
		const maxOpen = await maxOpenFrames(track);
		/** a packet's timestamp as its decoded sample carries it */
		const sampleT = (t: number) => Math.round(t * resolution) / resolution;
		/**
		 * The lane's one decode stream, dense and skim alike, so switching
		 * between them never decodes a stretch twice; reopened at the cursor
		 * after a failure.
		 */
		let source: FrameSource | null = null;
		let upcoming: Promise<SourceItem | null> | null = null;
		let exhausted = false;
		/** decoded, stream order, steps not taken yet */
		const queue: Pulled[] = [];
		const worker = await decodeWorker();
		const openSource = () => {
			source ??= openFrameSource(
				worker,
				file,
				cursor,
				tEnd,
				previewOptions,
				hardwareAcceleration,
			);
			return source;
		};
		const next = async (): Promise<Pulled | null> => {
			upcoming ??= source!.next();
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
			item.read = reader.read(item.frame!, { path }).then(prepareFrame);
			item.frame = null;
			source!.release(item);
		};
		const release = (item: Pulled) => {
			if (item.frame) {
				item.frame.close();
				item.frame = null;
				source!.release(item);
			}
			item.read?.then(
				({ frame }) => frame.delete(),
				() => {},
			);
			item.read = null;
		};
		const closeSource = () => {
			for (const item of queue.splice(0)) {
				release(item);
				item.preview?.close();
			}
			source?.close();
			source = null;
			upcoming = null;
			exhausted = false;
		};

		/**
		 * Dense decode from the cursor until the scan turns calm ("calm") or the
		 * chunk or media ends ("end"). Samples take their steps strictly in
		 * stream order — bookkeeping, analysis when due, the calm check — each
		 * against the scheduler state the previous analysis left, exactly as
		 * one frame at a time. What overlaps is only the wait: while a
		 * detector pass runs (much of it awaiting the GPU), the following
		 * samples are decoded and held, those certainly not due (before the
		 * pass's lower bound on the next due time) released, and the ones
		 * most likely due next read back in the helper workers.
		 */
		const scanActive = async (): Promise<"calm" | "end"> => {
			const stream = openSource();

			/** Awaits the frame and runs its pass, reading ahead meanwhile. */
			const analyzeAhead = async (
				prepared: Promise<PreparedFrame>,
				t: number,
				due: readonly string[],
			) => {
				let bound = scheduler!.nextDueLowerBound(t, due);
				const likely = scheduler!.predictDueTimes(t, due, 2);
				let guesses = readAheadTimes(
					likely,
					scheduler!.nextDueCandidates(t, due),
				);
				stream.floor(bound);
				stream.plan(scheduler!.checkPlan(t, due));
				let wake: () => void = () => {};
				let finished = false;
				const done = prepared.then((frame) =>
					analyzePrepared(frame, t, due, (parsing) => {
						bound = scheduler!.nextDueLowerBound(t, parsing);
						guesses = readAheadTimes(
							likely.filter((guess) => guess >= bound),
							scheduler!.nextDueCandidates(t, parsing),
						);
						stream.floor(bound);
						stream.plan(scheduler!.checkPlan(t, parsing));
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
				try {
					while (!finished) {
						for (const item of queue) if (item.t < bound) release(item);
						let reading = queue.filter((item) => item.read).length;
						for (const guess of guesses) {
							if (reading >= READ_AHEAD) break;
							const candidate = queue.find((item) => item.t >= guess);
							if (candidate?.frame) {
								readAhead(candidate);
								reading++;
							}
						}
						const open = queue.filter((item) => item.frame).length;
						const pulling =
							!exhausted &&
							open < maxOpen &&
							queue.every((item) => item.t < tEnd);
						const woken = new Promise<void>((resolve) => {
							wake = resolve;
						});
						if (!pulling) {
							await woken;
							continue;
						}
						upcoming ??= stream.next();
						if (
							(await Promise.race([upcoming.then(() => true), woken])) !== true
						)
							continue;
						const pulled = await next();
						if (pulled) queue.push(pulled);
					}
				} catch (error) {
					// a decode failure must not leave the pass running into the retry
					await done.catch(() => {});
					throw error;
				}
				await done;
			};

			for (;;) {
				// every sample before the next due time is certainly skipped
				stream.floor(scheduler!.nextDueT());
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
					stream.plan(scheduler!.checkPlan(item.t, []));
				} else {
					release(item);
				}
				report(item.preview);
				if (scheduler!.calm(cursor)) return "calm";
			}
		};

		/**
		 * The sample at `targetT` off the lane's stream, the samples before it
		 * dropped; null when the stream let it go before it was asked for.
		 */
		const skimTo = async (targetT: number): Promise<Pulled | null> => {
			const stream = openSource();
			stream.seek(targetT);
			for (;;) {
				const item = queue.shift() ?? (exhausted ? null : await next());
				if (!item) return null;
				if (item.t < targetT) {
					release(item);
					item.preview?.close();
					continue;
				}
				if (item.t === targetT && (item.frame || item.read)) return item;
				if (item.t === targetT) item.preview?.close();
				else queue.unshift(item);
				return null;
			}
		};

		try {
			while (!chunkAborted && cursor < tEnd) {
				try {
					if (mode === "active") {
						// dense sequential decode: every frame is seen, the scheduler
						// decides which are worth analyzing
						if ((await scanActive()) === "end") break;
						mode = "skim";
					} else {
						// skim: hop keyframe to keyframe while calm, capped so long
						// GOPs cannot hide a short screen
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
						// the sample getSample(target) is: the last one at or before it
						const targetPacket = await packets.getPacket(target, {
							verifyKeyPackets: true,
						});
						if (!targetPacket) {
							cursor = target;
							continue;
						}
						let item = await skimTo(sampleT(targetPacket.timestamp));
						if (!item) {
							// gone by before the hop was known: decode it afresh
							const sample = await samples.getSample(target);
							if (!sample) {
								cursor = target;
								continue;
							}
							const t = sample.timestamp;
							const frame = sample.toVideoFrame();
							sample.close();
							item = { t, frame, read: null };
							// not the stream's: nothing to release on it
							item.read = reader.read(frame, { path }).then(prepareFrame);
							item.frame = null;
						}
						const { t } = item;
						if (!item.preview && item.frame) {
							const now = performance.now();
							if (now - lastPreviewAt >= PREVIEW_POST_INTERVAL_MS) {
								lastPreviewAt = now;
								item.preview = await createImageBitmap(item.frame, {
									resizeWidth: PREVIEW_WIDTH,
									resizeHeight: PREVIEW_HEIGHT,
								});
							}
						}
						account(t);
						const due =
							t >= scheduler!.nextDueT() ? scheduler!.dueDetectors(t) : [];
						if (due.length > 0) {
							if (!item.read) readAhead(item);
							const read = item.read!;
							item.read = null;
							await analyzePrepared(await read, t, due);
						} else {
							release(item);
						}
						report(item.preview);
						cursor = Math.max(cursor, target);
						if (!scheduler!.calm(cursor)) mode = "active";
					}
				} catch (error) {
					closeSource();
					// resume at the cursor: a first failure there retries as is
					// (a crashed GPU process is back by then), a second decodes in
					// software from then on, a third hops over the spot
					if (chunkAborted || ++failures > MAX_CHUNK_FAILURES) throw error;
					failuresHere = cursor > failedAt ? 1 : failuresHere + 1;
					failedAt = cursor;
					// biome-ignore lint/suspicious/noConsole: the scan carries on, so say what it recovered from
					console.warn(
						`scanner: chunk ${chunkIndex} failed at ${cursor.toFixed(1)}s, resuming`,
						error,
					);
					if (failuresHere >= 2 && hardwareAcceleration !== "prefer-software") {
						hardwareAcceleration = "prefer-software";
						samples = new VideoSampleSink(track, { hardwareAcceleration });
					} else if (failuresHere >= 2) {
						cursor = Math.min(tEnd, cursor + UNDECODABLE_SKIP_S);
					}
					await new Promise((resolve) =>
						setTimeout(resolve, CHUNK_RETRY_DELAY_MS),
					);
				}
			}
		} finally {
			closeSource();
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
			message: String(error),
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

/**
 * What to read ahead, in order: the likeliest next due time, the other
 * times the pass in flight can make due next, then the likeliest after that.
 */
function readAheadTimes(
	likely: readonly number[],
	candidates: readonly number[],
): number[] {
	const [first, ...later] = likely;
	return [
		...(first === undefined ? [] : [first]),
		...candidates.filter((candidate) => candidate !== first),
		...later,
	];
}

async function decodesInSoftware(
	track: InputVideoTrack,
	chunkIndex: number,
): Promise<boolean> {
	if (
		chunkIndex % 2 === 0 ||
		navigator.hardwareConcurrency < SOFTWARE_LANE_MIN_THREADS
	) {
		return false;
	}
	const [codec, width, height] = await Promise.all([
		track.getCodec(),
		track.getDisplayWidth(),
		track.getDisplayHeight(),
	]);
	return codec === "av1" && width * height >= SOFTWARE_LANE_MIN_PIXELS;
}

/** A frame normalizeFrame would only copy: canonical size, no bars. */
function isCanonical({ width, height, data }: FrameData): boolean {
	return (
		width === CANONICAL_WIDTH &&
		height === CANONICAL_HEIGHT &&
		detectContentBox(width, height, data) === null
	);
}
