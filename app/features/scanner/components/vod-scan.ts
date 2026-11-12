/**
 * The running VoD scan, owned by a module singleton so moving between views
 * never throws it away. On the primary (WebCodecs) path the duration is
 * split into one contiguous slice per analyzer worker and each worker
 * demuxes, decodes, schedules and analyzes its slice itself
 * (worker/analyzer.worker.ts); the seek fallback drives a <video> element
 * through a single worker. Each worker keeps the timeline of what it scans
 * and reports its changes; the lanes' timelines are stitched at their seams
 * when the scan ends. Every analyzed frame's checks go to the scan's log
 * (core/scan-log.ts), per lane, so the scan can be replayed. The finished scan
 * persists under its file name
 * (store/vods.ts), then its clips are cut off the file (vod-clip-cutter.ts). Unlike a live session, a VoD's
 * matches never upload: without a wall clock they can't be told apart from
 * someone else's games. A scan is all or nothing: leaving the page cancels it and nothing is saved.
 */
import { useSyncExternalStore } from "react";
import * as R from "remeda";
import { openSeekScan, probeWebCodecs } from "../capture/vod-frames";
import {
	mergeScanTelemetry,
	type ScanTelemetry,
} from "../core/detectors/telemetry";
import { detectionOf } from "../core/events";
import { formatPosition } from "../core/format";
import {
	buildScannerMatches,
	withoutInvalidObjectives,
} from "../core/match-builder";
import * as ScanLog from "../core/scan-log";
import { sessionSummary } from "../core/sessions";
import { bringsFrame, stitchLanes } from "../core/timeline/index";
import {
	loadVodEventFrame,
	loadVodEvents,
	type StoredVodEvent,
	saveVod,
	type VodMinimap,
} from "../store/vods";
import {
	AnalyzerClient,
	type DoneInfo,
	defaultScanWorkerCount,
} from "../worker/client";
import { describeError } from "./errors";
import type { ScanEvent } from "./session-data";
import { readSettings } from "./settings";
import { cutVodClips } from "./vod-clip-cutter";
import { refreshVods } from "./vods-feed";

/** `video/*` alone hides containers the OS doesn't know as video (e.g. .mkv on macOS) */
export const VOD_FILE_ACCEPT = "video/*,.mkv,.webm,.mov,.mp4,.ts";

/** seek-fallback stride while the worker reports activity */
const SEEK_ACTIVE_STRIDE_S = 0.25;
/**
 * seek-fallback stride over calm footage — small enough that the screens that
 * start activity from dead air (results ~10s, match intro ~7s) still get sampled
 */
const SEEK_CALM_STRIDE_S = 2.5;

const UI_UPDATE_INTERVAL_MS = 250;
/**
 * Each publish re-renders every match card (expanded ones draw whole charts),
 * so found events reach the view at most this often, not per event.
 */
const EVENTS_PUBLISH_INTERVAL_MS = 1000;

type VodScanStatus = "idle" | "scanning" | "done" | "error";

type VodScanMode = "active" | "skim";

/** One worker's slice of the file. */
export interface VodScanLane {
	tStart: number;
	tEnd: number;
	/** seconds of video the lane has reached */
	t: number;
	mode: VodScanMode;
	done: boolean;
	/** the lane gave up at `t`; the rest of its slice went unscanned */
	failed: boolean;
}

interface VodScanProgress {
	t: number;
	duration: number;
	/** scan speed as a multiple of realtime */
	rate: number;
	lanes: VodScanLane[];
}

export interface VodScanSnapshot {
	name: string | null;
	status: VodScanStatus;
	error: string | null;
	/** what the scan found, chronological; reloaded from the store once saved */
	events: ScanEvent[];
	/** seconds from the scan's start until it was saved; null until done */
	tookSeconds: number | null;
}

/** Kept apart from the snapshot: it ticks several times a second, which must not re-render the match cards. */
export interface VodScanProgressSnapshot {
	progress: VodScanProgress | null;
	telemetry: ScanTelemetry | null;
}

const IDLE: VodScanSnapshot = {
	name: null,
	status: "idle",
	error: null,
	events: [],
	tookSeconds: null,
};

const IDLE_PROGRESS: VodScanProgressSnapshot = {
	progress: null,
	telemetry: null,
};

let snapshot = IDLE;
const listeners = new Set<() => void>();
let progressSnapshot = IDLE_PROGRESS;
const progressListeners = new Set<() => void>();
const laneCanvases = new Map<number, HTMLCanvasElement>();
/** lossless images of the frames the detectors analyzed this scan, until saved */
let frames = new WeakMap<ScanEvent, Blob>();
/** the log of this visit's scan, as far as it has come */
let scanLog: ScanLog.ScanLog | null = null;
let abortRef = { aborted: false };
let abortChunks: (() => void) | null = null;
/**
 * Bumped per scan: a cancelled scan's workers settle asynchronously, so
 * their writes must not land on the snapshot (or the preview canvas) of the
 * scan that replaced it.
 */
let generation = 0;
/** files scanned or opened this visit by name, so they can be played back */
const visitFiles = new Map<string, File>();

export function useVodScan(): VodScanSnapshot {
	return useSyncExternalStore(
		subscribe,
		() => snapshot,
		() => IDLE,
	);
}

function subscribe(listener: () => void): () => void {
	listeners.add(listener);
	return () => listeners.delete(listener);
}

function set(patch: Partial<VodScanSnapshot>): void {
	snapshot = { ...snapshot, ...patch };
	for (const listener of listeners) listener();
}

export function useVodScanProgress(): VodScanProgressSnapshot {
	return useSyncExternalStore(
		subscribeProgress,
		() => progressSnapshot,
		() => IDLE_PROGRESS,
	);
}

function subscribeProgress(listener: () => void): () => void {
	progressListeners.add(listener);
	return () => progressListeners.delete(listener);
}

function setProgress(patch: Partial<VodScanProgressSnapshot>): void {
	progressSnapshot = { ...progressSnapshot, ...patch };
	for (const listener of progressListeners) listener();
}

/** The view showing the scan hands over a canvas per lane (worker slice) for its frame preview. */
export function setVodLaneCanvas(
	lane: number,
	canvas: HTMLCanvasElement | null,
): void {
	if (canvas) laneCanvases.set(lane, canvas);
	else laneCanvases.delete(lane);
}

/** The frame an event of this scan was read from: in memory while scanning, the store once saved. */
export function vodScanFrame(
	event: ScanEvent,
): (() => Promise<Blob | undefined>) | undefined {
	const inMemory = frames.get(event);
	if (inMemory) return () => Promise.resolve(inMemory);
	if (event.hasFrame && event.id !== undefined) {
		const id = event.id;
		return () => loadVodEventFrame(id);
	}
	return undefined;
}

/** The log of the scan run this visit, still growing while it runs. */
export function vodScanLog(): ScanLog.ScanLog | undefined {
	return scanLog ?? undefined;
}

/** The file named `name` scanned or opened this visit; null when it was scanned in an earlier one. */
export function visitVodFile(name: string): File | null {
	return visitFiles.get(name) ?? null;
}

/** Keeps a file the user opened again for playback until the page is left. */
export function rememberVisitVodFile(file: File): void {
	visitFiles.set(file.name, file);
}

/** Stops a running scan; nothing of it is saved. */
export function cancelVodScan(): void {
	abortRef.aborted = true;
	abortChunks?.();
}

/**
 * Scans `file` as fast as decoding allows; a finished scan replaces any saved
 * one of the same name. `saveFrames: false` skips keeping each event's
 * analyzed frame and the map opens' snapshots, `clips: false` cutting clips
 * of the scan.
 */
export async function startVodScan(
	file: File,
	{
		telemetry,
		saveFrames = true,
		clips = true,
	}: { telemetry: boolean; saveFrames?: boolean; clips?: boolean },
): Promise<void> {
	cancelVodScan();
	const abort = { aborted: false };
	abortRef = abort;
	frames = new WeakMap();
	scanLog = null;
	visitFiles.set(file.name, file);
	const own = ++generation;
	const update = (patch: Partial<VodScanSnapshot>) => {
		if (own === generation) set(patch);
	};
	const updateProgress = (patch: Partial<VodScanProgressSnapshot>) => {
		if (own === generation) setProgress(patch);
	};
	const preview = (frame: ImageBitmap | VideoFrame, lane: number) => {
		if (own === generation) drawPreview(laneCanvases.get(lane), frame);
	};
	const scanStartedAt = performance.now();
	set({
		...IDLE,
		name: file.name,
		status: "scanning",
	});
	setProgress(IDLE_PROGRESS);

	let events: ScanEvent[] = [];
	/** per worker: where its slice starts and its timeline's events by slot key */
	const lanes: { tStart: number; events: Map<number, ScanEvent> }[] = [];
	const minimaps: VodMinimap[] = [];
	let log: ScanLog.ScanLog | null = null;
	const startLog = (slices: { tStart: number; tEnd: number }[]) => {
		log = ScanLog.create(slices);
		if (own === generation) scanLog = log;
	};
	let clients: AnalyzerClient[] = [];
	let publishTimer: ReturnType<typeof setTimeout> | null = null;
	const publish = () => {
		publishTimer ??= setTimeout(() => {
			publishTimer = null;
			events = lanes
				.flatMap((lane) => [...lane.events.values()])
				.sort((a, b) => a.t - b.t);
			update({ events });
		}, EVENTS_PUBLISH_INTERVAL_MS);
	};

	try {
		// seek fallback: latest per-frame done info + the waiter for the next one
		const seek: { doneInfo: DoneInfo | null; frameDone: (() => void) | null } =
			{ doneInfo: null, frameDone: null };
		clients = Array.from({ length: defaultScanWorkerCount() }, () => {
			const laneIndex = lanes.length;
			const lane = { tStart: 0, events: new Map<number, ScanEvent>() };
			lanes.push(lane);
			return new AnalyzerClient(
				(result) => {
					if (log) {
						ScanLog.record(log, laneIndex, result.t, {
							detector: result.detector,
							pass: result.gate.pass,
							variant: result.gate.variant,
							parsed: result.parsed,
							reads: ScanLog.readsOf(result.events),
						});
					}
					if (!result.gate.pass) return;
					if (result.minimapSnapshot) {
						minimaps.push({ t: result.t, image: result.minimapSnapshot });
					}
					for (const { action, key, event } of result.changes) {
						const held = lane.events.get(key);
						// an amended read keeps its slot's frame; an extended run's trailing read has none of its own
						const frame = bringsFrame(action)
							? result.frame
							: action === "amended" && held
								? frames.get(held)
								: undefined;
						const scanEvent: ScanEvent = {
							...event,
							hasFrame: frame !== undefined,
						};
						if (frame) frames.set(scanEvent, frame);
						lane.events.set(key, scanEvent);
					}
					if (result.changes.length > 0) publish();
				},
				(message) => {
					seek.frameDone?.();
					seek.frameDone = null;
					if (!abort.aborted) {
						update({ error: describeError(new Error(message)) });
					}
				},
				(_t, info: DoneInfo) => {
					seek.doneInfo = info;
					seek.frameDone?.();
					seek.frameDone = null;
				},
				{
					collectTelemetry: telemetry,
					webgpu: readSettings().webgpu,
					attachFrames: saveFrames,
					snapshotMinimaps: saveFrames,
				},
			);
		});
		await Promise.all(clients.map((c) => c.whenReady()));
		if (abort.aborted) return;

		const started = performance.now();

		const probe = await probeWebCodecs(file);
		if (abort.aborted) return;

		if (probe) {
			// each worker demuxes, decodes and analyzes its own slice of
			// the file; the main thread only aggregates progress
			const { duration } = probe;
			const span = duration / clients.length;
			for (const [i, lane] of lanes.entries()) lane.tStart = i * span;
			const chunks = clients.map((scanClient, i) => ({
				client: scanClient,
				tStart: i * span,
				tEnd: i === clients.length - 1 ? duration : (i + 1) * span,
				t: i * span,
				mode: "active" as VodScanMode,
				done: false,
				failed: false,
				telemetry: null as ScanTelemetry | null,
			}));
			startLog(chunks);
			abortChunks = () => {
				for (const client of clients) client.abortChunk();
			};
			const mergedTelemetry = () => {
				const parts = chunks.flatMap((c) => (c.telemetry ? [c.telemetry] : []));
				return parts.length > 0 ? mergeScanTelemetry(parts) : null;
			};
			let lastUiUpdate = Number.NEGATIVE_INFINITY;
			const pushUiUpdate = ({ force }: { force: boolean }) => {
				const now = performance.now();
				if (!force && now - lastUiUpdate < UI_UPDATE_INTERVAL_MS) return;
				lastUiUpdate = now;
				const covered = R.sumBy(
					chunks,
					(c) => Math.min(c.t, c.tEnd) - c.tStart,
				);
				const elapsed = (now - started) / 1000;
				updateProgress({
					progress: {
						t: covered,
						duration,
						rate: elapsed > 0 ? covered / elapsed : 0,
						lanes: chunks.map((c) => ({
							tStart: c.tStart,
							tEnd: c.tEnd,
							t: Math.min(c.t, c.tEnd),
							mode: c.mode,
							done: c.done,
							failed: c.failed,
						})),
					},
					telemetry: mergedTelemetry(),
				});
			};
			await Promise.allSettled(
				chunks.map((chunk, chunkIndex) =>
					chunk.client
						.scanChunk(
							{ file, chunkIndex, tStart: chunk.tStart, tEnd: chunk.tEnd },
							(chunkProgress) => {
								chunk.t = chunkProgress.t;
								chunk.mode = chunkProgress.mode;
								chunk.telemetry = chunkProgress.telemetry;
								if (chunkProgress.preview) {
									preview(chunkProgress.preview, chunkIndex);
									chunkProgress.preview.close();
								}
								pushUiUpdate({ force: false });
							},
						)
						.then(
							(chunkTelemetry) => {
								chunk.done = true;
								chunk.t = chunk.tEnd;
								chunk.telemetry = chunkTelemetry;
								pushUiUpdate({ force: true });
							},
							(error) => {
								chunk.done = true;
								chunk.failed = true;
								pushUiUpdate({ force: true });
								update({
									error: `Worker ${chunkIndex + 1} gave up, ${formatPosition(Math.min(chunk.t, chunk.tEnd))} – ${formatPosition(chunk.tEnd)} was not scanned (${describeError(error)})`,
								});
							},
						),
				),
			);
			abortChunks = null;
			if (abort.aborted) return;
			updateProgress({ telemetry: mergedTelemetry() });
			await finalize(duration);
			return;
		}

		// seek fallback: one worker, one frame in flight; the worker's calm
		// signal widens the stride over dead air
		const video = document.createElement("video");
		video.muted = true;
		video.playsInline = true;
		const url = URL.createObjectURL(file);
		video.src = url;
		try {
			const strideRef = { current: SEEK_ACTIVE_STRIDE_S };
			const vod = await openSeekScan(video, () => strideRef.current);
			if (abort.aborted) return;
			startLog([{ tStart: 0, tEnd: vod.duration }]);
			const client = clients[0]!;
			let lastUiUpdate = Number.NEGATIVE_INFINITY;
			for await (const { frame, t } of vod.frames) {
				if (abort.aborted) {
					frame.close();
					break;
				}
				const now = performance.now();
				if (now - lastUiUpdate >= UI_UPDATE_INTERVAL_MS) {
					lastUiUpdate = now;
					// the preview draw must precede analyze — transferring the
					// frame to the worker detaches it
					preview(frame, 0);
					const elapsed = (now - started) / 1000;
					updateProgress({
						progress: {
							t,
							duration: vod.duration,
							rate: elapsed > 0 ? t / elapsed : 0,
							lanes: [
								{
									tStart: 0,
									tEnd: vod.duration,
									t,
									mode: seek.doneInfo?.calm ? "skim" : "active",
									done: false,
									failed: false,
								},
							],
						},
						telemetry: seek.doneInfo?.telemetry ?? null,
					});
				}
				await new Promise<void>((resolve) => {
					seek.frameDone = resolve;
					if (!client.analyze(frame, t)) resolve();
				});
				strideRef.current = seek.doneInfo?.calm
					? SEEK_CALM_STRIDE_S
					: SEEK_ACTIVE_STRIDE_S;
			}
			if (!abort.aborted) await finalize(vod.duration);
		} finally {
			URL.revokeObjectURL(url);
		}
	} catch (error) {
		if (!abort.aborted)
			update({ status: "error", error: describeError(error) });
	} finally {
		if (publishTimer !== null) clearTimeout(publishTimer);
		for (const client of clients) client.dispose();
	}

	async function finalize(duration: number): Promise<void> {
		if (publishTimer !== null) clearTimeout(publishTimer);
		publishTimer = null;
		events = withoutInvalidObjectives(
			stitchLanes(
				lanes.map((lane) => ({
					tStart: lane.tStart,
					events: [...lane.events.values()],
				})),
				(event, from) => {
					const frame = frames.get(from);
					if (frame) frames.set(event, frame);
				},
			),
		);
		update({ events });
		updateProgress({
			progress: {
				t: duration,
				duration,
				rate: 0,
				lanes: progressSnapshot.progress?.lanes ?? [],
			},
		});
		await saveVod(
			{
				name: file.name,
				savedAt: Date.now(),
				duration,
				summary: sessionSummary(buildScannerMatches(events)),
			},
			events.map((event) => ({
				...detectionOf(event),
				frame: frames.get(event),
			})),
			minimaps,
			log ?? undefined,
		);
		events = (await loadVodEvents(file.name)).map(toScanEvent);
		update({
			events,
			status: "done",
			tookSeconds: (performance.now() - scanStartedAt) / 1000,
		});
		void refreshVods();
		if (clips) await cutVodClips({ name: file.name, file, events });
	}
}

function toScanEvent(event: StoredVodEvent): ScanEvent {
	return {
		...detectionOf(event),
		id: event.id,
		hasFrame: event.hasFrame,
	};
}

function drawPreview(
	canvas: HTMLCanvasElement | null | undefined,
	frame: ImageBitmap | VideoFrame,
): void {
	if (!canvas) return;
	const width = "displayWidth" in frame ? frame.displayWidth : frame.width;
	const height = "displayHeight" in frame ? frame.displayHeight : frame.height;
	if (canvas.width !== width || canvas.height !== height) {
		canvas.width = width;
		canvas.height = height;
	}
	canvas.getContext("2d")!.drawImage(frame, 0, 0);
}
