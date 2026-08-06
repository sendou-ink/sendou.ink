/**
 * AnalyzerWorker: owns OpenCV.js (WASM), the detector registry and a
 * DetectorScheduler. Two ways in:
 *
 * - "frame": the main thread posts one ImageBitmap/VideoFrame at a time
 *   (live capture, screenshot harness, the VoD seek fallback). Results come
 *   back per detector, then a "done" carrying the scheduler's calm signal
 *   and telemetry.
 * - "scanChunk": a VoD time slice is demuxed and decoded entirely in the
 *   worker with mediabunny. The worker owns a contiguous slice, so
 *   scheduling is exact, frames that no detector is due for skip canvas
 *   readback entirely, and calm stretches are skimmed by keyframe hops
 *   instead of decoding every frame — the big VoD speedup, since sequential
 *   decode is what bounds scan wall-clock time.
 */
import {
	ALL_FORMATS,
	BlobSource,
	EncodedPacketSink,
	Input,
	type VideoSample,
	VideoSampleSink,
} from "mediabunny";
import { loadOpenCV } from "../core/cv";
import { MAP_START_EVENT_TYPE } from "../core/detectors/map-start/index";
import {
	createAllDetectors,
	SCOREBOARD_EVENT_TYPES,
} from "../core/detectors/registry";
import { DetectorScheduler } from "../core/detectors/scheduler";
import {
	createScanTelemetry,
	detectorTelemetry,
} from "../core/detectors/telemetry";
import type { Detector } from "../core/detectors/types";
import { normalizeFrame, toMat } from "../core/image";
import type {
	AnalyzeRequest,
	InitRequest,
	ScanChunkRequest,
	WorkerRequest,
	WorkerResponse,
} from "./protocol";
import { fetchScoreboardResources } from "./resources";

/**
 * Widest skim hop: calm footage is sampled at the keyframe cadence, capped
 * here so long-GOP recordings still cannot slip a results screen (~10s) or
 * a match intro (~7s) between two samples.
 */
const MAX_SKIM_STRIDE_S = 2.5;
const PROGRESS_POST_INTERVAL_MS = 400;
const PREVIEW_POST_INTERVAL_MS = 600;
const PREVIEW_WIDTH = 480;
const PREVIEW_HEIGHT = 270;

let detectors: Detector<unknown>[] = [];
let scheduler: DetectorScheduler | null = null;
let telemetry = createScanTelemetry();
let chunkAborted = false;
/** last per-frame t, to reset telemetry when a new session rewinds the clock */
let lastFrameT = Number.NEGATIVE_INFINITY;

function post(message: WorkerResponse, transfer: Transferable[] = []): void {
	self.postMessage(message, { transfer });
}

async function init({
	assetsBaseUrl,
	suppressSteadyFrames = true,
}: InitRequest): Promise<void> {
	try {
		await loadOpenCV();
		const resources = await fetchScoreboardResources(assetsBaseUrl);
		detectors = createAllDetectors(resources);
		scheduler = new DetectorScheduler(detectors, {
			suppressSteadyFrames,
			matchOpeningTypes: [MAP_START_EVENT_TYPE],
			matchClosingTypes: SCOREBOARD_EVENT_TYPES,
		});
		telemetry = createScanTelemetry();
		post({ kind: "ready" });
	} catch (error) {
		post({ kind: "error", message: `init failed: ${String(error)}` });
	}
}

/**
 * Run the due detectors over one frame; closes `bitmap`. When the scheduler
 * has no detector due, the canvas readback and normalize are skipped too.
 */
async function analyzeFrame(
	bitmap: ImageBitmap | VideoFrame,
	t: number,
): Promise<void> {
	const due = scheduler!.dueDetectors(t);
	if (due.length === 0) {
		bitmap.close();
		return;
	}
	const width = "displayWidth" in bitmap ? bitmap.displayWidth : bitmap.width;
	const height =
		"displayHeight" in bitmap ? bitmap.displayHeight : bitmap.height;
	const canvas = new OffscreenCanvas(width, height);
	const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
	ctx.drawImage(bitmap, 0, 0);
	bitmap.close();
	const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

	const src = toMat({
		width: imageData.width,
		height: imageData.height,
		data: imageData.data,
	});
	let frame: ReturnType<typeof normalizeFrame>;
	try {
		frame = normalizeFrame(src);
	} finally {
		src.delete();
	}
	telemetry.analyzedFrames++;

	// On detection, ship back the exact analyzed pixels (lossless, at capture
	// resolution) so the UI never has to re-grab a later frame — encoded at
	// most once per frame, however many detectors fire on it.
	let encoded: Promise<Blob> | null = null;
	const frameBlob = () =>
		(encoded ??= canvas.convertToBlob({ type: "image/png" }));

	try {
		for (const detector of detectors) {
			if (!due.includes(detector.id)) continue;
			const counters = detectorTelemetry(telemetry, detector.id);
			counters.checks++;
			const gateStart = performance.now();
			const gate = detector.gate(frame);
			counters.gateMs += performance.now() - gateStart;
			scheduler!.recordGate(detector.id, t, gate.pass);
			if (gate.pass) counters.gatePasses++;
			const runParse = gate.pass && scheduler!.shouldParse(detector.id, t);
			if (gate.pass && !runParse) counters.suppressedParses++;
			let events: ReturnType<typeof detector.parse> = [];
			if (runParse) {
				const parseStart = performance.now();
				events = detector.parse(frame, t, gate);
				counters.parses++;
				counters.parseMs += performance.now() - parseStart;
				scheduler!.recordParse(detector.id, t, events);
			}
			const blob =
				events.length > 0 && detector.attachFrame !== false
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
	if (t + 5 < lastFrameT) telemetry = createScanTelemetry();
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
	telemetry = createScanTelemetry();
	const wallStart = performance.now();
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

		const handleSample = async (sample: VideoSample): Promise<void> => {
			telemetry.decodedFrames++;
			const t = sample.timestamp;
			const span = Math.max(0, t - cursor);
			if (mode === "active") telemetry.activeVideoS += span;
			else telemetry.skimVideoS += span;
			cursor = Math.max(cursor, t);
			const frame = sample.toVideoFrame();
			sample.close();
			const now = performance.now();
			let preview: ImageBitmap | undefined;
			if (now - lastPreviewAt >= PREVIEW_POST_INTERVAL_MS) {
				lastPreviewAt = now;
				preview = await createImageBitmap(frame, {
					resizeWidth: PREVIEW_WIDTH,
					resizeHeight: PREVIEW_HEIGHT,
				});
			}
			if (t >= scheduler!.nextDueT()) {
				await analyzeFrame(frame, t);
			} else {
				frame.close();
			}
			if (preview || now - lastProgressAt >= PROGRESS_POST_INTERVAL_MS) {
				lastProgressAt = now;
				telemetry.wallMs = performance.now() - wallStart;
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
			}
		};

		scan: while (!chunkAborted && cursor < tEnd) {
			if (mode === "active") {
				// dense sequential decode: every frame is seen, the scheduler
				// decides which are worth analyzing
				for await (const sample of samples.samples(cursor)) {
					if (!sample) continue;
					if (chunkAborted || sample.timestamp >= tEnd) {
						sample.close();
						break scan;
					}
					await handleSample(sample);
					if (scheduler!.calm(cursor)) {
						mode = "skim";
						break;
					}
				}
				if (mode === "active") break; // media ended before tEnd
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
				await handleSample(sample);
				cursor = Math.max(cursor, target);
				if (!scheduler!.calm(cursor)) mode = "active";
			}
		}

		telemetry.wallMs = performance.now() - wallStart;
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

self.onmessage = (e: MessageEvent) => {
	const msg = e.data as WorkerRequest;
	if (msg.kind === "init") void init(msg);
	else if (msg.kind === "frame") void analyze(msg);
	else if (msg.kind === "scanChunk") void scanChunk(msg);
	else if (msg.kind === "abortChunk") chunkAborted = true;
};
