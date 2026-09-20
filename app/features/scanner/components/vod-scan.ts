/**
 * The running VoD scan, owned by a module singleton so moving between views
 * never throws it away. On the primary (WebCodecs) path the duration is
 * split into one contiguous slice per analyzer worker and each worker
 * demuxes, decodes, schedules and analyzes its slice itself
 * (worker/analyzer.worker.ts); the seek fallback drives a <video> element
 * through a single worker. The finished scan persists under its file name
 * (store/vods.ts), then the same path a live session takes runs: clips of
 * the scored windows are cut off the file, and unsent matches upload. A
 * scan is all or nothing: leaving the page cancels it and nothing is saved.
 */
import { useSyncExternalStore } from "react";
import * as R from "remeda";
import { extractVodClip, vodFrameThumbnail } from "../capture/vod-clips";
import { openSeekScan, probeWebCodecs } from "../capture/vod-frames";
import { MAX_CLIP_SECONDS, scoreWindows } from "../core/clips/scoring";
import { DEATH_EVENT_TYPE } from "../core/detectors/death/index";
import {
	mergeScanTelemetry,
	type ScanTelemetry,
} from "../core/detectors/telemetry";
import type { DetectedEvent } from "../core/detectors/types";
import {
	buildScannerMatches,
	invalidObjectiveEvents,
} from "../core/match-builder";
import { sessionSummary } from "../core/sessions";
import { TimelineBuilder } from "../core/timeline/index";
import { deleteVodClips, saveClip } from "../store/clips";
import {
	loadVodEventFrame,
	loadVodEvents,
	type StoredVodEvent,
	saveVod,
} from "../store/vods";
import {
	AnalyzerClient,
	type DoneInfo,
	defaultScanWorkerCount,
} from "../worker/client";
import { refreshClips } from "./clips-feed";
import { describeError } from "./errors";
import type { FixtureData } from "./fixture-export";
import { unsentMatches } from "./sendou-ingest";
import type { ScanEvent } from "./session-data";
import { readSettings } from "./settings";
import { thumbnailFromBlob } from "./thumbnail";
import { sendVod, uploadEnabled } from "./upload";
import { refreshVods } from "./vods-feed";

/** seek-fallback stride while the worker reports activity */
const SEEK_ACTIVE_STRIDE_S = 0.25;
/**
 * seek-fallback stride over calm footage — small enough that the screens that
 * start activity from dead air (results ~10s, match intro ~7s) still get sampled
 */
const SEEK_CALM_STRIDE_S = 2.5;

/** A file's clips: the best windows over the whole scan, as many as fit history's cap. */
const MAX_VOD_CLIPS = 20;

const UI_UPDATE_INTERVAL_MS = 250;

export type VodScanStatus = "idle" | "scanning" | "done" | "error";

export type ClipsWork =
	| { state: "cutting"; done: number; total: number }
	| { state: "done"; saved: number; error: string | null };

export interface VodScanProgress {
	t: number;
	duration: number;
	/** scan speed as a multiple of realtime */
	rate: number;
}

export interface VodScanSnapshot {
	name: string | null;
	status: VodScanStatus;
	error: string | null;
	progress: VodScanProgress | null;
	/** what the scan found, chronological; reloaded from the store once saved */
	events: ScanEvent[];
	saveClips: boolean;
	clipsWork: ClipsWork | null;
	telemetry: ScanTelemetry | null;
	/** matches uploading right after the scan */
	uploading: boolean;
}

const IDLE: VodScanSnapshot = {
	name: null,
	status: "idle",
	error: null,
	progress: null,
	events: [],
	saveClips: false,
	clipsWork: null,
	telemetry: null,
	uploading: false,
};

let snapshot = IDLE;
const listeners = new Set<() => void>();
let previewCanvas: HTMLCanvasElement | null = null;
/** lossless PNGs of the frames the detectors analyzed this scan, until saved */
let frames = new WeakMap<ScanEvent, Blob>();
let abortRef = { aborted: false };
let abortChunks: (() => void) | null = null;
/**
 * Bumped per scan: a cancelled scan's workers settle asynchronously and
 * its thumbnail work drains after, so their writes must not land on the
 * snapshot (or the preview canvas) of the scan that replaced it.
 */
let generation = 0;

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

/** The view showing the scan hands over its canvas for the frame preview. */
export function setVodPreviewCanvas(canvas: HTMLCanvasElement | null): void {
	previewCanvas = canvas;
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

/** Stops a running scan; nothing of it is saved. */
export function cancelVodScan(): void {
	abortRef.aborted = true;
	abortChunks?.();
}

/** Re-reads the saved events (send statuses) of the shown scan. */
async function reloadVodScanEvents(): Promise<void> {
	if (!snapshot.name || snapshot.status === "scanning") return;
	set({ events: await loadVodEvents(snapshot.name) });
}

/** Uploads the shown scan's unsent matches, or the ones `include` selects. */
export async function uploadVodScan(
	include: (
		built: Parameters<typeof unsentMatches>[0],
	) => boolean = unsentMatches,
): Promise<void> {
	if (!snapshot.name) return;
	set({ uploading: true });
	try {
		await sendVod(snapshot.name, include, () => void reloadVodScanEvents());
	} finally {
		set({ uploading: false });
	}
}

/** Scans `file` as fast as decoding allows; a finished scan replaces any saved one of the same name. */
export async function startVodScan(
	file: File,
	{ saveClips, telemetry }: { saveClips: boolean; telemetry: boolean },
): Promise<void> {
	cancelVodScan();
	const abort = { aborted: false };
	abortRef = abort;
	frames = new WeakMap();
	const own = ++generation;
	const update = (patch: Partial<VodScanSnapshot>) => {
		if (own === generation) set(patch);
	};
	const preview = (frame: ImageBitmap | VideoFrame) => {
		if (own === generation) drawPreview(frame);
	};
	set({
		...IDLE,
		name: file.name,
		status: "scanning",
		saveClips,
	});

	const timeline = new TimelineBuilder();
	let events: ScanEvent[] = [];
	let clients: AnalyzerClient[] = [];
	const thumbnailWork: Promise<void>[] = [];
	const publish = () => update({ events });

	try {
		// seek fallback: latest per-frame done info + the waiter for the next one
		const seek: { doneInfo: DoneInfo | null; frameDone: (() => void) | null } =
			{ doneInfo: null, frameDone: null };
		clients = Array.from(
			{ length: defaultScanWorkerCount() },
			() =>
				new AnalyzerClient(
					(result) => {
						if (!result.gate.pass) return;
						for (const event of result.events as DetectedEvent<FixtureData>[]) {
							const action = timeline.push(event);
							if (action.action === "merged" || action.action === "dropped")
								continue;
							const frame =
								action.action === "extended" ? undefined : result.frame;
							thumbnailWork.push(
								(async () => {
									const thumbnail = frame
										? await thumbnailFromBlob(frame)
										: undefined;
									const replaced =
										action.action === "added"
											? undefined
											: events.find((e) => sameEvent(e, action.replaced));
									const scanEvent: ScanEvent = {
										...event,
										thumbnail,
										hasFrame: frame !== undefined,
									};
									if (frame) frames.set(scanEvent, frame);
									events = events.filter((e) => e !== replaced);
									events.push(scanEvent);
									events.sort((a, b) => a.t - b.t);
									publish();
								})().catch(() => {}),
							);
						}
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
					{ collectTelemetry: telemetry },
				),
		);
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
			const chunks = clients.map((scanClient, i) => ({
				client: scanClient,
				tStart: i * span,
				tEnd: i === clients.length - 1 ? duration : (i + 1) * span,
				t: i * span,
				done: false,
				telemetry: null as ScanTelemetry | null,
			}));
			abortChunks = () => {
				for (const client of clients) client.abortChunk();
			};
			const mergedTelemetry = () => {
				const parts = chunks.flatMap((c) => (c.telemetry ? [c.telemetry] : []));
				return parts.length > 0 ? mergeScanTelemetry(parts) : null;
			};
			let lastUiUpdate = Number.NEGATIVE_INFINITY;
			const pushUiUpdate = () => {
				const now = performance.now();
				if (now - lastUiUpdate < UI_UPDATE_INTERVAL_MS) return;
				lastUiUpdate = now;
				const covered = R.sumBy(
					chunks,
					(c) => Math.min(c.t, c.tEnd) - c.tStart,
				);
				const elapsed = (now - started) / 1000;
				update({
					progress: {
						t: covered,
						duration,
						rate: elapsed > 0 ? covered / elapsed : 0,
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
								chunk.telemetry = chunkProgress.telemetry;
								if (chunkProgress.preview) {
									// show one chunk at a time: the earliest still running
									if (chunks.find((c) => !c.done) === chunk) {
										preview(chunkProgress.preview);
									}
									chunkProgress.preview.close();
								}
								pushUiUpdate();
							},
						)
						.then(
							(chunkTelemetry) => {
								chunk.done = true;
								chunk.t = chunk.tEnd;
								chunk.telemetry = chunkTelemetry;
							},
							(error) => {
								chunk.done = true;
								update({ error: describeError(error) });
							},
						),
				),
			);
			abortChunks = null;
			if (abort.aborted) return;
			update({ telemetry: mergedTelemetry() });
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
					preview(frame);
					const elapsed = (now - started) / 1000;
					update({
						progress: {
							t,
							duration: vod.duration,
							rate: elapsed > 0 ? t / elapsed : 0,
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
		for (const client of clients) client.dispose();
	}

	async function finalize(duration: number): Promise<void> {
		await Promise.all(thumbnailWork);
		events = withoutInvalidObjectives(events);
		update({ events, progress: { t: duration, duration, rate: 0 } });
		await saveVod(
			{
				name: file.name,
				savedAt: Date.now(),
				duration,
				summary: sessionSummary(
					buildScannerMatches(events).map((built) => built.match),
				),
			},
			events.map((event) => ({
				type: event.type,
				t: event.t,
				confidence: event.confidence,
				data: event.data,
				thumbnail: event.thumbnail,
				frame: frames.get(event),
				send: event.send,
			})),
		);
		events = (await loadVodEvents(file.name)).map(toScanEvent);
		update({ events, status: "done" });
		void refreshVods();
		if (saveClips) await cutClips(file, events, update);
		if (uploadEnabled()) await uploadVodScan();
	}
}

/** Objective reads that grouped into a known non-SZ match (misreads) are dropped. */
function withoutInvalidObjectives(events: ScanEvent[]): ScanEvent[] {
	const invalid = new Set(invalidObjectiveEvents(buildScannerMatches(events)));
	return invalid.size > 0 ? events.filter((e) => !invalid.has(e)) : events;
}

/** Clips the file's best scored windows, replacing any earlier clips of the same file. */
async function cutClips(
	file: File,
	events: ScanEvent[],
	update: (patch: Partial<VodScanSnapshot>) => void,
): Promise<void> {
	const windows = buildScannerMatches(events)
		.flatMap((built) => {
			const deaths = built.sources
				.filter((event) => event.type === DEATH_EVENT_TYPE)
				.map((event) => event.t);
			return scoreWindows(built.match, deaths, {
				minKills: readSettings().clipMinKills,
			}).map((window) => ({
				window,
				built,
			}));
		})
		.sort((a, b) => b.window.score - a.window.score)
		.slice(0, MAX_VOD_CLIPS);
	await deleteVodClips(file.name).catch(() => {});
	if (windows.length === 0) {
		await refreshClips();
		return;
	}
	update({ clipsWork: { state: "cutting", done: 0, total: windows.length } });
	let saved = 0;
	try {
		for (const { window, built } of windows) {
			const clip = await extractVodClip(file, {
				start: window.start,
				end: window.end,
				maxSeconds: MAX_CLIP_SECONDS,
			});
			const thumbnail = (await vodFrameThumbnail(file, window.t)) ?? undefined;
			await saveClip(
				{
					createdAt: Date.now(),
					bucket: "vod",
					source: { kind: "vod", name: file.name },
					start: clip.start,
					end: clip.end,
					t: window.t,
					time: window.time,
					score: window.score,
					kills: window.kills,
					mode: built.match.mode,
					stage: built.match.stage,
					hasAudio: clip.hasAudio,
					thumbnail,
				},
				clip.blob,
			);
			saved++;
			update({
				clipsWork: { state: "cutting", done: saved, total: windows.length },
			});
			await refreshClips();
		}
		update({ clipsWork: { state: "done", saved, error: null } });
	} catch (error) {
		update({
			clipsWork: { state: "done", saved, error: describeError(error) },
		});
	}
}

function toScanEvent(event: StoredVodEvent): ScanEvent {
	return {
		id: event.id,
		type: event.type,
		t: event.t,
		confidence: event.confidence,
		data: event.data,
		thumbnail: event.thumbnail,
		hasFrame: event.hasFrame,
		send: event.send,
	};
}

/** A stored event re-pushed into the timeline is a different object than the scan's copy. */
function sameEvent(a: ScanEvent, b: DetectedEvent): boolean {
	return a === b || (a.type === b.type && a.t === b.t && a.data === b.data);
}

function drawPreview(frame: ImageBitmap | VideoFrame): void {
	const canvas = previewCanvas;
	if (!canvas) return;
	const width = "displayWidth" in frame ? frame.displayWidth : frame.width;
	const height = "displayHeight" in frame ? frame.displayHeight : frame.height;
	if (canvas.width !== width || canvas.height !== height) {
		canvas.width = width;
		canvas.height = height;
	}
	canvas.getContext("2d")!.drawImage(frame, 0, 0);
}
