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
	openDesktopAudio,
	requestInputAccess,
	resolveVideoInput,
	startSampler,
} from "../capture/sampler";
import {
	type ClipWindow,
	MAX_CLIP_SECONDS,
	povDeathTimes,
	STREAK_MAX_GAP_S,
	scoreWindows,
	windowClosed,
} from "../core/clips/scoring";
import {
	MAP_START_EVENT_TYPE,
	type MapStartData,
} from "../core/detectors/map-start/index";
import { OBJECTIVE_EVENT_TYPE } from "../core/detectors/objective/index";
import { PLAYER_STATUS_EVENT_TYPE } from "../core/detectors/objective/player-status";
import { SCOREBOARD_EVENT_TYPES } from "../core/detectors/registry";
import type { DetectedEvent } from "../core/detectors/types";
import type { ScannerMatch } from "../core/scanner-match";
import { TimelineBuilder } from "../core/timeline/index";
import {
	deleteClip,
	requestPersistentStorage,
	rollSessionClipsIntoHistory,
	saveClip,
} from "../store/clips";
import { saveEvent, trimEvents } from "../store/events";
import { AnalyzerClient } from "../worker/client";
import { getClips, refreshClips } from "./clips-feed";
import { describeError } from "./errors";
import {
	currentSession,
	findSession,
	getFeed,
	newestSessionKey,
	refreshFeed,
	subscribeFeed,
} from "./events-feed";
import { type FixtureData, saveFrame } from "./fixture-export";
import {
	matchContaining,
	retryDueMatches,
	unsentClosedMatches,
	unsentMatches,
	unsentScoreboardMatches,
} from "./sendou-ingest";
import { audioDeviceIdOf, readSettings } from "./settings";
import { sendLive, uploadEnabled } from "./upload";
import { deleteClosedVisitsVodClips } from "./visit";

const SAMPLE_FPS = 2;

/**
 * A slow parse (a browsed battle-log entry, a CJK splash-tag name) can occupy
 * the worker for seconds to tens of seconds; buffering the frames sampled
 * meanwhile keeps the stall from being missed. 24 frames hold ~12s at full
 * density; past that the backlog is decimated toward even spacing over the
 * stall (worker/frame-queue.ts) so a results screen mid-stall survives.
 */
const FRAME_QUEUE_LIMIT = 24;

/** How often unlinked and failed matches are rechecked for a retry (backoff in sendou-ingest.ts). */
const UPLOAD_RETRY_TICK_MS = 15_000;

/** Footage kept for clips: the longest clip plus the wait for its window to close, with margin. */
const RING_BUFFER_SECONDS = MAX_CLIP_SECONDS + STREAK_MAX_GAP_S + 10;

/** Windows close by time passing, not only by new events. */
const CLIP_TICK_MS = 5_000;
/** how often the audio input is checked for a signal, and how long without one counts as silent */
const AUDIO_CHECK_MS = 1_000;
const AUDIO_SILENCE_MS = 5_000;
/** one capture per browser profile: two would write the same games twice */
const CAPTURE_LOCK = "scanner:capture";
const SOURCE_ENDED_ERROR =
	"The capture source was disconnected — check the capture card or OBS Virtual Camera and start the capture again";
const NO_SOURCE_ERROR =
	"No capture card or OBS Virtual Camera found — connect one, or pick the source from the list next to the button";
/**
 * Without its atlases the worker reads no names, digits, lobbies or stages;
 * such games would upload as unread lobbies (which pass the lobby filter), so
 * the capture doesn't start at all rather than store them.
 */
const MISSING_ATLASES_ERROR =
	"Some of the scanner's game data could not be downloaded — check the connection and start the capture again";

export type LiveStatus = "idle" | "starting" | "running" | "error";
/** `unsupported`: no WebCodecs/track processor; `failed`: the encoder refused this stream */
export type ClipsState = "on" | "off" | "unsupported" | "failed";
/** `muted`: the browser gets nothing from the device; `silent`: it gets samples, all of them silence; `ended`: the track stopped (a share ended, say); `failed`: the encoder gave up */
export type AudioSignal = "ok" | "silent" | "muted" | "ended" | "failed";

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
	/** what the clip encoder is getting from that track; null while clips are off */
	audioSignal: AudioSignal | null;
	clips: ClipsState;
	/** frames whose analysis threw this capture; each is skipped and the capture carries on */
	failedFrames: number;
}

const IDLE: LiveSnapshot = {
	status: "idle",
	error: null,
	since: null,
	stream: null,
	hasAudio: false,
	audioError: null,
	audioSignal: null,
	clips: "off",
	failedFrames: 0,
};

let snapshot = IDLE;
const listeners = new Set<() => void>();

let video: HTMLVideoElement | null = null;
let client: AnalyzerClient | null = null;
let ring: ClipRingBuffer | null = null;
let stopSampler: (() => void) | null = null;
let retryTimer: ReturnType<typeof setInterval> | null = null;
let clipTimer: ReturnType<typeof setInterval> | null = null;
let audioTimer: ReturnType<typeof setInterval> | null = null;
let releaseCaptureLock: (() => void) | null = null;
/** the last capture's Stop work (its final clips landing), which the next capture waits out */
let captureEnding: Promise<void> = Promise.resolve();
let unsubscribeFeed: (() => void) | null = null;
let timeline = new TimelineBuilder();
const storedIds = new WeakMap<DetectedEvent, number>();
/** event saves in flight, so Stop's last clip pass sees the final kills */
const persisting = new Set<Promise<void>>();
// the open match is known to be a mode with no counter overlay (Turf War), so
// counter reads are lookalike misreads and are not collected at all
let objectiveBlocked = false;
/** windows already cut, `${match first source id}:${window t}` */
/**
 * Footage cut this capture, plus (at tick time) the session's saved clips
 * from earlier captures — the session outlives a capture, so its windows
 * come up again after a restart. A kill belongs to one clip: a window over
 * footage already cut (redrawn by a late-read kill, or simply seen again)
 * is skipped unless it scores higher, when it replaces the clips it overlaps.
 */
const cuts: LiveCut[] = [];
/** clips this capture saved, already represented in `cuts` */
const ownClipIds = new Set<number>();

interface LiveCut {
	start: number;
	end: number;
	score: number;
	/** the saved clip's id, once the cut lands; null when it yielded nothing */
	clipId: Promise<number | null>;
}

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

/**
 * Opens the source, brings the worker up, then starts sampling; a second call
 * while running is ignored.
 */
export async function startCapture(): Promise<void> {
	if (snapshot.status === "starting" || snapshot.status === "running") return;
	// before any await, so a double click's second call sees it and bails
	set({ ...IDLE, status: "starting" });
	await captureEnding;
	const releaseLock = await acquireCaptureLock();
	if (!releaseLock) {
		set({
			...IDLE,
			status: "error",
			error:
				"The scanner is already capturing in another tab. Stop it there first.",
		});
		return;
	}
	releaseCaptureLock = releaseLock;
	objectiveBlocked = false;
	cuts.length = 0;
	ownClipIds.clear();
	timeline = new TimelineBuilder();
	let stream: MediaStream | null = null;
	try {
		const settings = readSettings();
		// first thing, while the click's activation still covers the share picker
		const desktop =
			settings.audioSource === "desktop" ? await openDesktopAudio() : null;
		const noInputs = { video: [], audio: [] };
		let inputs = await listMediaInputs().catch(() => noInputs);
		// the source's audio side is only listed with the microphone permission
		if (!inputsRevealed(inputs) && (await requestInputAccess())) {
			inputs = await listMediaInputs().catch(() => noInputs);
		}
		const videoInput = resolveVideoInput(inputs.video, settings.sourceDeviceId);
		if (!videoInput) {
			desktop?.track?.stop();
			throw new Error(NO_SOURCE_ERROR);
		}
		const sourceAudio =
			settings.audioSource === "source"
				? audioInputFor(videoInput, inputs.audio)
				: null;
		const opened = await openCapture({
			videoDeviceId: videoInput.deviceId,
			audioDeviceId:
				sourceAudio?.deviceId ?? audioDeviceIdOf(settings.audioSource),
		});
		stream = opened.stream;
		if (desktop?.track) stream.addTrack(desktop.track);
		const videoTrack = stream.getVideoTracks()[0];
		videoTrack?.addEventListener("ended", () => onSourceEnded(opened.stream));
		video = document.createElement("video");
		video.muted = true;
		video.playsInline = true;
		video.srcObject = stream;
		await video.play();

		// the worker first: a failed init must not leave the camera on
		const starting = new AnalyzerClient(onResult, onWorkerError, undefined, {
			frameQueueLimit: FRAME_QUEUE_LIMIT,
			webgpu: settings.webgpu,
			onFrameError,
		});
		client = starting;
		try {
			await starting.whenReady();
			if (starting.missingAtlases.length > 0) {
				throw new Error(MISSING_ATLASES_ERROR);
			}
		} catch (error) {
			starting.dispose();
			if (client === starting) client = null;
			throw error;
		}

		let clips: ClipsState = "off";
		if (settings.saveClips) {
			if (!supportsRingBuffer()) {
				clips = "unsupported";
			} else {
				const startingRing = new ClipRingBuffer(RING_BUFFER_SECONDS, () =>
					onClipsFailed(startingRing),
				);
				ring = startingRing;
				try {
					await startingRing.start(stream);
					clips = "on";
				} catch {
					startingRing.stop();
					if (ring === startingRing) ring = null;
					clips = "failed";
				}
			}
		}

		// the worker died while the ring started and onWorkerError tore down what it could
		if (client !== starting) throw new Error("The analyzer worker stopped");
		if (videoTrack?.readyState === "ended") throw new Error(SOURCE_ENDED_ERROR);
		stopSampler = startSampler(video, SAMPLE_FPS, (bitmap, t) => {
			client?.analyze(bitmap, t);
		});
		// a match sent the moment its scoreboard closed usually beats the players to
		// reporting it, so sendou.ink had nothing to link to; retry those (and
		// failed sends) while the capture runs, along with closed matches whose
		// close-send was never attempted
		retryTimer = setInterval(() => {
			if (uploadEnabled()) {
				void sendLive(
					(built) => retryDueMatches(built) || unsentClosedMatches(built),
					newestSessionKey(),
				);
			}
		}, UPLOAD_RETRY_TICK_MS);
		clipTimer = setInterval(clipTick, CLIP_TICK_MS);
		audioTimer = setInterval(audioCheck, AUDIO_CHECK_MS);
		unsubscribeFeed = subscribeFeed(clipTick);
		// a session is only worth coming back to if the browser keeps it
		requestPersistentStorage();
		void trimEvents()
			.then(() => refreshFeed(0))
			.catch(() => {});
		set({
			status: "running",
			since: Date.now(),
			stream,
			hasAudio: stream.getAudioTracks().length > 0,
			audioError: desktop ? desktop.error : opened.audioError,
			// the encoder may have given up between starting and here
			clips: ring?.failure ? "failed" : clips,
		});
	} catch (error) {
		if (stream) stopTracks(stream);
		release();
		// a worker failure already showed why, which is friendlier than how the start ended
		if (snapshot.status !== "error") {
			set({ ...IDLE, status: "error", error: describeError(error) });
		}
	}
}

/**
 * Ends the capture: windows still open are cut as they stand, the session's
 * clips roll into history once every cut has landed, and unsent matches get
 * one last send.
 */
export function stopCapture(): void {
	if (snapshot.status === "idle") return;
	endCapture({ ...IDLE });
}

/** Tears the capture down into `next`, rolling the session's clips and sending unsent matches as Stop does. */
function endCapture(next: LiveSnapshot): void {
	const stream = snapshot.stream;
	// the ring outlives the capture until its last clips are cut
	const endingRing = ring;
	ring = null;
	// and so does the lock: a capture another tab started meanwhile would have its first clips rolled
	const releaseLock = releaseCaptureLock;
	releaseCaptureLock = null;
	release();
	if (stream) stopTracks(stream);
	set(next);
	// the scan ending is the last match boundary — flush what's unsent
	// (partials are safe: the server merges them into fuller resends)
	if (uploadEnabled()) void sendLive(unsentMatches, newestSessionKey());
	captureEnding = cutRemainingClips(endingRing)
		.then(() => rollSessionClipsIntoHistory())
		.then(() => refreshClips())
		.catch(() => {})
		.finally(() => releaseLock?.());
	void trimEvents()
		.then(() => refreshFeed(0))
		.catch(() => {});
}

/**
 * Once per page load: drops the VoD clips of visits no tab has open any more,
 * and rolls session clips left by a capture that never reached Stop (a
 * reload, a closed tab) into history — unless a capture is running in
 * another tab, whose session they are. A capture started meanwhile waits.
 */
export function settleClipStore(): void {
	captureEnding = captureEnding
		.then(() =>
			Promise.allSettled([
				deleteClosedVisitsVodClips(),
				rollAbandonedSessionClips(),
			]),
		)
		.then(() => refreshClips());
}

function rollAbandonedSessionClips(): Promise<unknown> {
	if (!navigator.locks) return rollSessionClipsIntoHistory();
	// holding the lock keeps another tab from starting a capture mid-roll
	return navigator.locks.request(CAPTURE_LOCK, { ifAvailable: true }, (lock) =>
		lock ? rollSessionClipsIntoHistory() : undefined,
	);
}

/**
 * Retries unlinked and failed uploads while the scanner page is open without
 * a capture (a running one retries on its own tick), so a backlog flushed at
 * Stop still relinks. The first pass covers every session not yet compacted,
 * picking up the retries a closed tab cut short. Returns the stop function.
 */
export function retryUploadsWhileOpen(): () => void {
	if (uploadEnabled()) void sendLive(retryDueMatches, 0);
	const timer = setInterval(() => {
		if (!retryTimer && uploadEnabled()) {
			void sendLive(retryDueMatches, newestSessionKey());
		}
	}, UPLOAD_RETRY_TICK_MS);
	return () => clearInterval(timer);
}

/** Debug: the current capture frame as a PNG download. */
export function saveCurrentFrameAsFixture(): void {
	if (!video) return;
	void saveFrame(video);
}

function release(): void {
	releaseCaptureLock?.();
	releaseCaptureLock = null;
	stopSampler?.();
	stopSampler = null;
	if (retryTimer) clearInterval(retryTimer);
	retryTimer = null;
	if (clipTimer) clearInterval(clipTimer);
	clipTimer = null;
	if (audioTimer) clearInterval(audioTimer);
	audioTimer = null;
	unsubscribeFeed?.();
	unsubscribeFeed = null;
	ring?.stop();
	ring = null;
	client?.dispose();
	client = null;
	if (video) video.srcObject = null;
	video = null;
}

/**
 * Holds the capture lock until the returned function is called; null when
 * another tab (or a page instance left running) holds it. The browser lets
 * go of a tab's locks when it closes or crashes, so a dead capture never
 * blocks the next one.
 */
function acquireCaptureLock(): Promise<(() => void) | null> {
	if (!navigator.locks) return Promise.resolve(() => {});
	return new Promise((resolve) => {
		void navigator.locks.request(
			CAPTURE_LOCK,
			{ ifAvailable: true },
			(lock) => {
				if (!lock) {
					resolve(null);
					return;
				}
				return new Promise<void>((unlock) => resolve(unlock));
			},
		);
	});
}

function stopTracks(stream: MediaStream): void {
	for (const track of stream.getTracks()) track.stop();
}

/** The worker itself is gone (init failed or it crashed), so the capture cannot go on. */
function onWorkerError(message: string): void {
	const failed: LiveSnapshot = {
		...IDLE,
		status: "error",
		error: describeError(new Error(message)),
	};
	if (snapshot.status === "running") {
		endCapture(failed);
		return;
	}
	const stream = snapshot.stream;
	release();
	if (stream) stopTracks(stream);
	set(failed);
}

/** The video input went away (unplugged, OBS Virtual Camera stopped); without it the capture would sit on a frozen frame. */
function onSourceEnded(stream: MediaStream): void {
	if (snapshot.status !== "running" || snapshot.stream !== stream) return;
	endCapture({ ...IDLE, status: "error", error: SOURCE_ENDED_ERROR });
}

function onFrameError(message: string): void {
	if (snapshot.failedFrames === 0) {
		// biome-ignore lint/suspicious/noConsole: the capture carries on, so the console is where a failing frame shows why
		console.warn("scanner: frame analysis failed", message);
	}
	set({ failedFrames: snapshot.failedFrames + 1 });
}

function onResult(
	result: Parameters<ConstructorParameters<typeof AnalyzerClient>[0]>[0],
): void {
	if (!result.gate.pass) return;
	for (const event of result.events as DetectedEvent<FixtureData>[]) {
		if (
			(event.type === OBJECTIVE_EVENT_TYPE ||
				event.type === PLAYER_STATUS_EVENT_TYPE) &&
			objectiveBlocked
		) {
			continue;
		}
		const action = timeline.push(event);
		if (action.action === "merged" || action.action === "dropped") continue;
		if (event.type === MAP_START_EVENT_TYPE) {
			const mode = (event.data as MapStartData).mode;
			objectiveBlocked = mode === "TW";
		} else if (SCOREBOARD_EVENT_TYPES.includes(event.type)) {
			objectiveBlocked = false;
		}
		const stale =
			action.action === "added" ? undefined : storedIds.get(action.replaced);
		// a run's trailing read only moves its time; the run's first read keeps the frame
		const frame = action.action === "extended" ? undefined : result.frame;
		const saving = persist(event, frame, stale);
		persisting.add(saving);
		void saving.finally(() => persisting.delete(saving));
	}
}

async function persist(
	event: DetectedEvent,
	frame: Blob | undefined,
	stale: number | undefined,
): Promise<void> {
	try {
		// reusing the replaced event's id keeps match card keys stable, so
		// repeat detections don't remount the cards
		const id = await saveEvent(event, frame, stale);
		storedIds.set(event, id);
		if (uploadEnabled() && SCOREBOARD_EVENT_TYPES.includes(event.type)) {
			// a scoreboard closes its match — send it, again if it went out
			// without one; a better read of an already sent scoreboard is not resent
			const unsent =
				stale === undefined ? unsentScoreboardMatches : unsentMatches;
			refreshFeed();
			await sendLive(
				(built) => matchContaining(id)(built) && unsent(built),
				newestSessionKey(),
			);
		}
	} catch (error) {
		set({ error: describeError(error) });
	}
	refreshFeed();
}

/**
 * The clip encoder gave up mid-capture: the capture goes on without new
 * footage, the ring still cuts the windows it holds.
 */
function onClipsFailed(failed: ClipRingBuffer): void {
	if (ring !== failed || snapshot.status !== "running") return;
	set({ clips: "failed", audioSignal: null });
}

/** Whether the clip encoder is getting sound; a device that opens fine but delivers silence shows up here. */
function audioCheck(): void {
	if (snapshot.status !== "running" || snapshot.clips !== "on") return;
	const track = snapshot.stream?.getAudioTracks()[0];
	const signalAt = ring?.audioSignalAt ?? null;
	const next: AudioSignal | null = !track
		? null
		: ring?.audioFailure
			? "failed"
			: track.readyState === "ended"
				? "ended"
				: track.muted
					? "muted"
					: signalAt === null
						? null
						: Date.now() / 1000 - signalAt > AUDIO_SILENCE_MS / 1000
							? "silent"
							: "ok";
	if (next !== snapshot.audioSignal) set({ audioSignal: next });
}

/** Cuts every scored window of the running session whose post-roll is in the ring. */
function clipTick(): void {
	if (!ring || snapshot.status !== "running") return;
	cutWindows(ring, Date.now() / 1000);
}

/**
 * Stop's last clip pass: once the final kills are in the feed, every window
 * still open is cut with the footage there is, and the capture's cuts land
 * before the ring goes.
 */
async function cutRemainingClips(
	endingRing: ClipRingBuffer | null,
): Promise<void> {
	if (!endingRing) return;
	try {
		await Promise.all(persisting);
		await refreshFeed();
		cutWindows(endingRing, Number.POSITIVE_INFINITY);
		await Promise.all(cuts.map((cut) => cut.clipId));
	} finally {
		endingRing.stop();
	}
}

/** Cuts the session's scored windows closed by `nowT` that no better clip already covers. */
function cutWindows(clipRing: ClipRingBuffer, nowT: number): void {
	const feed = getFeed();
	const session = currentSession(feed);
	if (!session) return;
	const saved: LiveCut[] = getClips()
		.filter(
			(clip) =>
				clip.source.kind === "live" &&
				findSession(feed, clip.source.sessionKey) === session &&
				!ownClipIds.has(clip.id),
		)
		.map((clip) => ({
			start: clip.start,
			end: clip.end,
			score: clip.score,
			clipId: Promise.resolve(clip.id),
		}));
	for (const built of session.clipMatches) {
		for (const window of scoreWindows(
			built.match,
			povDeathTimes(built.sources),
			{
				minKills: readSettings().clipMinKills,
			},
		)) {
			if (!windowClosed(window, nowT)) continue;
			const overlapping = [...cuts, ...saved].filter(
				(cut) => window.start < cut.end && window.end > cut.start,
			);
			if (overlapping.some((cut) => cut.score >= window.score)) continue;
			for (const cut of overlapping) {
				if (cuts.includes(cut)) cuts.splice(cuts.indexOf(cut), 1);
				else saved.splice(saved.indexOf(cut), 1);
			}
			const clipId = cutClip(
				clipRing,
				session.key,
				built.match,
				window,
				overlapping,
			);
			cuts.push({
				start: window.start,
				end: window.end,
				score: window.score,
				clipId,
			});
		}
	}
}

/** Cuts and saves the window, then drops the clips it `replaces`; resolves to the saved clip's id. */
async function cutClip(
	clipRing: ClipRingBuffer,
	sessionKey: number,
	match: ScannerMatch,
	window: ClipWindow,
	replaces: readonly LiveCut[],
): Promise<number | null> {
	try {
		const clip = await clipRing.cut(
			window.start,
			window.end,
			readSettings().audioOffsetMs / 1000,
		);
		if (!clip) return null;
		const saved = await saveClip(
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
		if (!saved) {
			// out of room: the clips it would have replaced stay, and the next
			// tick sees them again as saved clips
			for (const cut of replaces) {
				const id = await cut.clipId;
				if (id !== null) ownClipIds.delete(id);
			}
			return null;
		}
		ownClipIds.add(saved.id);
		for (const cut of replaces) {
			const id = await cut.clipId;
			if (id !== null) await deleteClip(id);
		}
		requestPersistentStorage();
		await refreshClips();
		return saved.id;
	} catch (error) {
		set({ error: describeError(error) });
		return null;
	}
}
