/**
 * AnalyzerWorker: owns OpenCV.js (WASM), the detector registry and a
 * DetectorScheduler. "frame": the main thread posts one ImageBitmap/VideoFrame
 * at a time; results come back per detector, then a "done" with the calm
 * signal and telemetry. "scanChunk": a VoD slice is demuxed/decoded in the
 * worker with mediabunny — the worker owns a contiguous slice so scheduling is
 * exact, undue frames skip canvas readback, and calm stretches skim by
 * keyframe hops — the big VoD speedup, since sequential decode bounds scan time.
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
	type ScanTelemetry,
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

/** Widest skim hop, so long-GOP recordings can't slip a results screen (~10s) or intro (~7s) between samples. */
const MAX_SKIM_STRIDE_S = 2.5;
const PROGRESS_POST_INTERVAL_MS = 400;
const PREVIEW_POST_INTERVAL_MS = 600;
const PREVIEW_WIDTH = 480;
const PREVIEW_HEIGHT = 270;

let detectors: Detector<unknown>[] = [];
let scheduler: DetectorScheduler | null = null;
/** null unless the init message asked for telemetry */
let telemetry: ScanTelemetry | null = null;
let collectTelemetry = false;
let chunkAborted = false;
/** last per-frame t, to reset telemetry when a new session rewinds the clock */
let lastFrameT = Number.NEGATIVE_INFINITY;

function post(message: WorkerResponse, transfer: Transferable[] = []): void {
	self.postMessage(message, { transfer });
}

async function init({
	assetsBaseUrl,
	suppressSteadyFrames = true,
	collectTelemetry: collect = false,
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
	if (telemetry) telemetry.analyzedFrames++;

	// ship back the exact analyzed pixels (lossless, capture resolution) so the
	// UI never re-grabs a later frame — encoded at most once per frame
	let encoded: Promise<Blob> | null = null;
	const frameBlob = () =>
		(encoded ??= canvas.convertToBlob({ type: "image/png" }));

	try {
		for (const detector of detectors) {
			if (!due.includes(detector.id)) continue;
			const counters = telemetry
				? detectorTelemetry(telemetry, detector.id)
				: null;
			const gateStart = counters ? performance.now() : 0;
			const gate = detector.gate(frame);
			if (counters) {
				counters.checks++;
				counters.gateMs += performance.now() - gateStart;
			}
			scheduler!.recordGate(detector.id, t, gate.pass, gate.signature);
			if (counters && gate.pass) counters.gatePasses++;
			const runParse = gate.pass && scheduler!.shouldParse(detector.id, t);
			if (counters && gate.pass && !runParse) counters.suppressedParses++;
			let events: ReturnType<typeof detector.parse> = [];
			if (runParse) {
				const parseStart = counters ? performance.now() : 0;
				events = detector.parse(frame, t, gate);
				if (counters) {
					counters.parses++;
					counters.parseMs += performance.now() - parseStart;
				}
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
	if (t + 5 < lastFrameT) telemetry = freshTelemetry();
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
			const t = sample.timestamp;
			if (telemetry) {
				telemetry.decodedFrames++;
				const span = Math.max(0, t - cursor);
				if (mode === "active") telemetry.activeVideoS += span;
				else telemetry.skimVideoS += span;
			}
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
				if (telemetry) telemetry.wallMs = performance.now() - wallStart;
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

		if (telemetry) telemetry.wallMs = performance.now() - wallStart;
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
