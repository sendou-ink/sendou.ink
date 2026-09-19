/**
 * The live capture, owned by a module singleton rather than a view so that
 * moving between views (or off the page) keeps it running until Stop. Source
 * frames from the capture stream go to the analyzer worker; its events land
 * in the live event store (from which the feed derives sessions and
 * matches), close matches upload themselves, and the ring buffer cuts a clip
 * whenever a scored window closes — the same event → match → clip → upload
 * path a VoD scan runs, fed from a stream instead of a file.
 */
import { useSyncExternalStore } from "react";
import { ClipRingBuffer, supportsRingBuffer } from "../capture/ring-buffer";
import {
	audioInputFor,
	inputsRevealed,
	listMediaInputs,
	openCapture,
	requestInputAccess,
	startSampler,
} from "../capture/sampler";
import {
	type ClipWindow,
	MAX_CLIP_SECONDS,
	STREAK_MAX_GAP_S,
	scoreWindows,
	windowClosed,
} from "../core/clips/scoring";
import { DEATH_EVENT_TYPE } from "../core/detectors/death/index";
import { KILL_EVENT_TYPE } from "../core/detectors/kill/index";
import {
	MAP_START_EVENT_TYPE,
	type MapStartData,
} from "../core/detectors/map-start/index";
import { MINIMAP_EVENT_TYPE } from "../core/detectors/minimap/index";
import { OBJECTIVE_EVENT_TYPE } from "../core/detectors/objective/index";
import { PLAYER_STATUS_EVENT_TYPE } from "../core/detectors/objective/player-status";
import { SCOREBOARD_EVENT_TYPES } from "../core/detectors/registry";
import type { DetectedEvent, GateResult } from "../core/detectors/types";
import type { ScannerMatch } from "../core/scanner-match";
import { TimelineBuilder } from "../core/timeline/index";
import {
	requestPersistentStorage,
	rollSessionClipsIntoHistory,
	saveClip,
} from "../store/clips";
import { saveEvent, trimEvents, updateEventsSend } from "../store/events";
import { AnalyzerClient } from "../worker/client";
import { refreshClips } from "./clips-feed";
import { describeError } from "./errors";
import {
	currentSession,
	getFeed,
	refreshFeed,
	subscribeFeed,
} from "./events-feed";
import { type FixtureData, saveFixture } from "./fixture-export";
import {
	matchContaining,
	retryableUnlinkedMatches,
	unsentClosedMatches,
	unsentMatches,
} from "./sendou-ingest";
import { readSettings } from "./settings";
import { thumbnailFromBlob } from "./thumbnail";
import { sendLive, uploadEnabled } from "./upload";

const SAMPLE_FPS = 2;

/**
 * A slow parse (a browsed battle-log entry, a CJK splash-tag name) can occupy
 * the worker for seconds to tens of seconds; buffering the frames sampled
 * meanwhile keeps the stall from being missed. 24 frames hold ~12s at full
 * density; past that the backlog is decimated toward even spacing over the
 * stall (worker/frame-queue.ts) so a results screen mid-stall survives.
 */
const FRAME_QUEUE_LIMIT = 24;

/** How often a running capture rechecks unlinked matches for a retry (backoff in sendou-ingest.ts). */
const UNLINKED_RETRY_TICK_MS = 15_000;

/** Footage kept for clips: the longest clip plus the wait for its window to close, with margin. */
const RING_BUFFER_SECONDS = MAX_CLIP_SECONDS + STREAK_MAX_GAP_S + 10;

/** Windows close by time passing, not only by new events. */
const CLIP_TICK_MS = 5_000;

/** Event types the ingested matches are built from — the only ones with a send status. */
const INGESTABLE_TYPES = [
	MAP_START_EVENT_TYPE,
	DEATH_EVENT_TYPE,
	KILL_EVENT_TYPE,
	MINIMAP_EVENT_TYPE,
	...SCOREBOARD_EVENT_TYPES,
];

export type LiveStatus = "idle" | "starting" | "running" | "error";
/** `unsupported`: no WebCodecs/track processor; `failed`: the encoder refused this stream */
export type ClipsState = "on" | "off" | "unsupported" | "failed";

export interface LiveSnapshot {
	status: LiveStatus;
	error: string | null;
	/** wall-clock ms the capture started */
	since: number | null;
	stream: MediaStream | null;
	/** the capture carries the source's audio track */
	hasAudio: boolean;
	/** why it does not, when an audio input was expected */
	audioError: string | null;
	clips: ClipsState;
	/** highest gate score on the latest frame (debug) */
	gateScore: number | null;
	/** a detector fired on the latest frame */
	detecting: boolean;
}

const IDLE: LiveSnapshot = {
	status: "idle",
	error: null,
	since: null,
	stream: null,
	hasAudio: false,
	audioError: null,
	clips: "off",
	gateScore: null,
	detecting: false,
};

let snapshot = IDLE;
const listeners = new Set<() => void>();

let video: HTMLVideoElement | null = null;
let client: AnalyzerClient | null = null;
let ring: ClipRingBuffer | null = null;
let stopSampler: (() => void) | null = null;
let retryTimer: ReturnType<typeof setInterval> | null = null;
let clipTimer: ReturnType<typeof setInterval> | null = null;
let unsubscribeFeed: (() => void) | null = null;
let timeline = new TimelineBuilder();
const storedIds = new WeakMap<DetectedEvent, number>();
const gates = new Map<string, GateResult>();
let latestParse: { type: string; data: FixtureData } | null = null;
// the open match is known to be a non-SZ mode, so counter reads are
// misreads of another mode's overlay and are not collected at all
let objectiveBlocked = false;
/** windows already cut, `${match first source id}:${window t}` */
const cutWindows = new Set<string>();

export function useLiveSession(): LiveSnapshot {
	return useSyncExternalStore(
		subscribe,
		() => snapshot,
		() => IDLE,
	);
}

export function getLiveSession(): LiveSnapshot {
	return snapshot;
}

function subscribe(listener: () => void): () => void {
	listeners.add(listener);
	return () => listeners.delete(listener);
}

function set(patch: Partial<LiveSnapshot>): void {
	snapshot = { ...snapshot, ...patch };
	for (const listener of listeners) listener();
}

/** Opens the source, brings the worker up, then starts sampling; a second call while running is ignored. */
export async function startCapture(): Promise<void> {
	if (snapshot.status === "starting" || snapshot.status === "running") return;
	set({ ...IDLE, status: "starting" });
	objectiveBlocked = false;
	gates.clear();
	cutWindows.clear();
	timeline = new TimelineBuilder();
	let stream: MediaStream | null = null;
	try {
		const settings = readSettings();
		const noInputs = { video: [], audio: [] };
		let inputs = await listMediaInputs().catch(() => noInputs);
		// the source's audio side is only listed with the microphone permission
		if (!inputsRevealed(inputs) && (await requestInputAccess())) {
			inputs = await listMediaInputs().catch(() => noInputs);
		}
		const videoInput =
			inputs.video.find((d) => d.deviceId === settings.sourceDeviceId) ?? null;
		const audioInput = videoInput
			? audioInputFor(videoInput, inputs.audio)
			: null;
		const opened = await openCapture({
			videoDeviceId: settings.sourceDeviceId,
			audioDeviceId: audioInput?.deviceId ?? null,
		});
		stream = opened.stream;
		video = document.createElement("video");
		video.muted = true;
		video.playsInline = true;
		video.srcObject = stream;
		await video.play();

		// the worker first: a failed init must not leave the camera on
		client = new AnalyzerClient(onResult, onWorkerError, undefined, {
			frameQueueLimit: FRAME_QUEUE_LIMIT,
		});
		try {
			await client.whenReady();
		} catch (error) {
			client.dispose();
			client = null;
			throw error;
		}

		let clips: ClipsState = "off";
		if (settings.saveClips) {
			if (!supportsRingBuffer()) {
				clips = "unsupported";
			} else {
				ring = new ClipRingBuffer(RING_BUFFER_SECONDS);
				try {
					await ring.start(stream);
					clips = "on";
				} catch {
					ring.stop();
					ring = null;
					clips = "failed";
				}
			}
		}

		stopSampler = startSampler(video, SAMPLE_FPS, (bitmap, t) => {
			client?.analyze(bitmap, t);
		});
		// a match sent the moment its scoreboard closed usually beats the players to
		// reporting it, so sendou.ink had nothing to link to; retry those while the
		// capture runs, along with closed matches whose close-send was never attempted
		retryTimer = setInterval(() => {
			if (uploadEnabled()) {
				void sendLive(
					(built) =>
						retryableUnlinkedMatches(built) || unsentClosedMatches(built),
				);
			}
		}, UNLINKED_RETRY_TICK_MS);
		clipTimer = setInterval(clipTick, CLIP_TICK_MS);
		unsubscribeFeed = subscribeFeed(clipTick);
		void trimEvents().catch(() => {});
		set({
			status: "running",
			since: Date.now(),
			stream,
			hasAudio: stream.getAudioTracks().length > 0,
			audioError: opened.audioError,
			clips,
		});
	} catch (error) {
		if (stream) stopTracks(stream);
		release();
		set({ ...IDLE, status: "error", error: describeError(error) });
	}
}

/** Ends the capture: the session's clips roll into history and unsent matches get one last send. */
export function stopCapture(): void {
	if (snapshot.status === "idle") return;
	const stream = snapshot.stream;
	release();
	if (stream) stopTracks(stream);
	set({ ...IDLE });
	// the scan ending is the last match boundary — flush what's unsent
	// (partials are safe: the server merges them into fuller resends)
	if (uploadEnabled()) void sendLive(unsentMatches);
	void rollSessionClipsIntoHistory()
		.then(() => refreshClips())
		.catch(() => {});
	void trimEvents().catch(() => {});
}

/** Debug: the current frame plus the latest parse as a fixture download. */
export function saveCurrentFrameAsFixture(): void {
	if (!video) return;
	void saveFixture(video, latestParse);
}

function release(): void {
	stopSampler?.();
	stopSampler = null;
	if (retryTimer) clearInterval(retryTimer);
	retryTimer = null;
	if (clipTimer) clearInterval(clipTimer);
	clipTimer = null;
	unsubscribeFeed?.();
	unsubscribeFeed = null;
	ring?.stop();
	ring = null;
	client?.dispose();
	client = null;
	if (video) video.srcObject = null;
	video = null;
}

function stopTracks(stream: MediaStream): void {
	for (const track of stream.getTracks()) track.stop();
}

function onWorkerError(message: string): void {
	const stream = snapshot.stream;
	release();
	if (stream) stopTracks(stream);
	set({ ...IDLE, status: "error", error: describeError(new Error(message)) });
}

function onResult(
	result: Parameters<ConstructorParameters<typeof AnalyzerClient>[0]>[0],
): void {
	// one result arrives per detector per frame; status reflects whether any fired
	gates.set(result.detector, result.gate);
	const scores = [...gates.values()];
	const detecting = scores.some((g) => g.pass);
	set({
		gateScore: Math.max(...scores.map((g) => g.score)),
		detecting,
	});
	if (!result.gate.pass) return;
	for (const event of result.events as DetectedEvent<FixtureData>[]) {
		latestParse = { type: event.type, data: event.data };
		if (
			(event.type === OBJECTIVE_EVENT_TYPE ||
				event.type === PLAYER_STATUS_EVENT_TYPE) &&
			objectiveBlocked
		) {
			continue;
		}
		const action = timeline.push(event);
		if (action.action !== "added" && action.action !== "replaced") continue;
		if (event.type === MAP_START_EVENT_TYPE) {
			const mode = (event.data as MapStartData).mode;
			objectiveBlocked = mode !== null && mode !== "SZ";
		} else if (SCOREBOARD_EVENT_TYPES.includes(event.type)) {
			objectiveBlocked = false;
		}
		const stale =
			action.action === "replaced" ? storedIds.get(action.replaced) : undefined;
		void persist(event, result.frame, stale);
	}
}

async function persist(
	event: DetectedEvent,
	frame: Blob | undefined,
	stale: number | undefined,
): Promise<void> {
	try {
		const thumbnail = frame ? await thumbnailFromBlob(frame) : undefined;
		// reusing the replaced event's id keeps match card keys stable, so
		// repeat detections don't remount the cards
		const id = await saveEvent(event, thumbnail, frame, stale);
		storedIds.set(event, id);
		if (uploadEnabled() && INGESTABLE_TYPES.includes(event.type)) {
			if (SCOREBOARD_EVENT_TYPES.includes(event.type)) {
				// a scoreboard closes its match — send it
				refreshFeed();
				await sendLive(
					(built) => matchContaining(id)(built) && unsentMatches(built),
				);
			} else {
				await updateEventsSend([id], { state: "queued", at: Date.now() });
			}
		}
	} catch (error) {
		set({ error: describeError(error) });
	}
	refreshFeed();
}

/** Cuts every scored window of the running session whose post-roll is in the ring. */
function clipTick(): void {
	if (!ring || snapshot.status !== "running") return;
	const session = currentSession(getFeed());
	if (!session) return;
	const nowT = Date.now() / 1000;
	for (const built of session.built) {
		const deaths = built.sources
			.filter((event) => event.type === DEATH_EVENT_TYPE)
			.map((event) => event.t);
		for (const window of scoreWindows(built.match, deaths, {
			minKills: readSettings().clipMinKills,
		})) {
			const key = `${built.sources[0]?.id ?? built.match.startsAt}:${window.t}`;
			if (cutWindows.has(key) || !windowClosed(window, nowT)) continue;
			cutWindows.add(key);
			void cutClip(session.key, built.match, window);
		}
	}
}

async function cutClip(
	sessionKey: number,
	match: ScannerMatch,
	window: ClipWindow,
): Promise<void> {
	if (!ring) return;
	try {
		const clip = await ring.cut(window.start, window.end);
		if (!clip) return;
		await saveClip(
			{
				createdAt: Date.now(),
				bucket: "session",
				source: { kind: "live", sessionKey },
				start: clip.start,
				end: clip.end,
				t: window.t,
				time: window.time,
				score: window.score,
				kills: window.kills,
				mode: match.mode,
				stage: match.stage,
				hasAudio: clip.hasAudio,
				thumbnail: clip.thumbnail,
			},
			clip.blob,
		);
		requestPersistentStorage();
		await refreshClips();
	} catch (error) {
		set({ error: describeError(error) });
	}
}
