/**
 * Links the live capture to the tournament broadcast the user's OBS URL shows
 * while its tournament is on (`BROADCAST_SCANNER_URL`, looked up again when
 * the URL is pointed elsewhere and every minute): games starting and ending
 * on the capture put the broadcast's scenes waiting for them on air, timed by when
 * they were seen, and the teams' ink colors the game (GameCues, broadcast's
 * `Producer.applyGameSignal`). Once a game ended, what was read of it
 * follows for the scenes after the game, with each moment of its end (the
 * broadcast cutting away at Judd's flag). A cast never shows the results
 * screen that would send its match, so the game ending sends it instead;
 * every other upload goes on as without a link. While capturing, the link holds the
 * broadcast's stream open, which is how the dashboard knows a scanner is on.
 */
import { useSyncExternalStore } from "react";
import type {
	BroadcastGameSignal,
	BroadcastGameSummary,
	BroadcastStreamMessage,
} from "~/features/broadcast/broadcast-types";
import {
	BROADCAST_SCANNER_URL,
	broadcastGameUrl,
	broadcastStreamUrl,
} from "~/features/broadcast/broadcast-urls";
import type { BroadcastScannerLoaderData } from "~/features/broadcast-cast/routes/broadcast.scanner";
import { gameSummary } from "../core/broadcast-summary";
import type { DetectedEvent } from "../core/events";
import * as GameCues from "../core/GameCues";
import type { BroadcastTarget } from "../scanner-activity";
import { getFeed, newestSessionKey, refreshFeed } from "./events-feed";
import { unsentMatches } from "./sendou-ingest";
import { sendLive, uploadEnabled } from "./upload";

const REOPEN_DELAY_MS = 5_000;
/** Also catches the OBS URL pointed at a broadcast (or its tournament starting) while the capture follows none. */
const LOOKUP_INTERVAL_MS = 60_000;
const SIGNAL_DESCRIPTIONS: Record<BroadcastGameSignal["type"], string> = {
	start: "the game started",
	ink: "the teams' ink colors",
	end: "the game ended",
};
/** How long a game's end waits for what was read of the game: the cut at its HUD going away waits along, and is off without it. */
const SUMMARY_TIMEOUT_MS = 5_000;

export interface BroadcastLinkSnapshot {
	target: BroadcastTarget | null;
	/** The broadcast's stream is open, i.e. the dashboard counts this scanner. */
	isConnected: boolean;
	error: string | null;
}

const UNLINKED: BroadcastLinkSnapshot = {
	target: null,
	isConnected: false,
	error: null,
};

let snapshot = UNLINKED;
const listeners = new Set<() => void>();

let isCapturing = false;
let cuesState = GameCues.initialState();
let stream: EventSource | null = null;
let reopenTimer: ReturnType<typeof setTimeout> | null = null;
let lookupTimer: ReturnType<typeof setInterval> | null = null;
/** The signals posted so far, the next one going out after them so the broadcast sees them in order. */
let posting: Promise<void> = Promise.resolve();
/** What was read of the game that ended last, which each moment of its end carries (see `endedGameSummary`). */
let endedSummary: Promise<BroadcastGameSummary | null> = Promise.resolve(null);

export function useBroadcastLink(): BroadcastLinkSnapshot {
	return useSyncExternalStore(
		subscribe,
		() => snapshot,
		() => UNLINKED,
	);
}

/** The capture started (`true`) or stopped. */
export function setCapturing(capturing: boolean): void {
	isCapturing = capturing;
	cuesState = GameCues.initialState();
	if (lookupTimer) clearInterval(lookupTimer);
	lookupTimer = null;
	if (!capturing) {
		retarget(null);
		return;
	}

	void lookUpTarget();
	lookupTimer = setInterval(() => void lookUpTarget(), LOOKUP_INTERVAL_MS);
}

/** A detector event of the capture, as it came in. */
export function observeEvent(event: DetectedEvent): void {
	if (!snapshot.target || !isCapturing) return;

	advance({ kind: "event", event });
}

/**
 * The capture's frame of `t` was analyzed, after its events: time passing as far as the analysis got, not the clock,
 * so a parse stall holding the frames back can't count as the HUD gone.
 */
export function observeFrameAnalyzed(t: number): void {
	if (!snapshot.target || !isCapturing) return;

	advance({ kind: "tick", t });
}

/** The capture's map overlay gate passed at `t`: an observer has the map open over the HUD. */
export function observeMapOpen(t: number): void {
	if (!snapshot.target || !isCapturing) return;

	advance({ kind: "mapOpen", t });
}

/** Asks which broadcast to follow, keeping the current one when the answer doesn't come. */
async function lookUpTarget(): Promise<void> {
	try {
		const response = await fetch(BROADCAST_SCANNER_URL);
		if (!response.ok) return;

		const { broadcast } = (await response.json()) as BroadcastScannerLoaderData;
		if (isCapturing) retarget(broadcast);
	} catch {
		// offline for a moment, the next lookup tries again
	}
}

/** Follows the broadcast, a running capture switching over right away. */
function retarget(target: BroadcastTarget | null): void {
	if (
		target?.tournamentId === snapshot.target?.tournamentId &&
		target?.slug === snapshot.target?.slug
	) {
		return;
	}

	disconnect();
	set({ ...UNLINKED, target });
	if (isCapturing && target) openStream(target);
}

function subscribe(listener: () => void): () => void {
	listeners.add(listener);
	return () => listeners.delete(listener);
}

function set(patch: Partial<BroadcastLinkSnapshot>): void {
	snapshot = { ...snapshot, ...patch };
	for (const listener of listeners) listener();
}

function disconnect(): void {
	if (reopenTimer) clearTimeout(reopenTimer);
	reopenTimer = null;
	stream?.close();
	stream = null;
	if (snapshot.isConnected) set({ isConnected: false });
}

function openStream(target: BroadcastTarget): void {
	stream = new EventSource(broadcastStreamUrl({ ...target, role: "scanner" }));
	stream.onmessage = (event) => {
		if (!snapshot.isConnected) set({ isConnected: true, error: null });

		const message = JSON.parse(event.data) as BroadcastStreamMessage;
		if (message.kind === "reconnect") reopenStream(target, 0);
		// the OBS URL was pointed at another broadcast
		if (message.kind === "reload") void lookUpTarget();
	};
	stream.onerror = () => {
		set({ isConnected: false });
		// CLOSED means the browser gave up reconnecting on its own, e.g. after a non-200 response
		if (stream?.readyState === EventSource.CLOSED) {
			set({
				error:
					"Couldn't connect to the broadcast — log in as an organizer or streamer of the tournament",
			});
			reopenStream(target, REOPEN_DELAY_MS);
		}
	};
}

function reopenStream(target: BroadcastTarget, delayMs: number): void {
	stream?.close();
	stream = null;
	if (reopenTimer) clearTimeout(reopenTimer);
	reopenTimer = setTimeout(() => {
		reopenTimer = null;
		if (isCapturing && snapshot.target === target) openStream(target);
	}, delayMs);
}

function advance(input: GameCues.GameCuesInput): void {
	const stepped = GameCues.step(cuesState, input);
	cuesState = stepped.state;

	for (const cue of stepped.cues) {
		const isHudGone = cue.type === "end" && cue.trigger === "hudGone";
		if (isHudGone) endedSummary = endedGameSummary(cue);
		posting = posting.then(async () => postSignal(await toSignal(cue)));
		if (isHudGone && uploadEnabled()) {
			void sendLive(
				(built) => isMatchAt(built.match, cue.t) && unsentMatches(built),
				newestSessionKey(),
			);
		}
	}
}

async function toSignal(cue: GameCues.GameCue): Promise<BroadcastGameSignal> {
	if (cue.type === "ink") return cue;
	if (cue.type === "start") return { type: "start", inks: cue.inks };

	return { type: "end", trigger: cue.trigger, summary: await endedSummary };
}

/**
 * What was read of the game that ended, as the live sessions built it once its HUD went away. `null` for an intro
 * whose game never showed, or when building it takes too long: the later moments of the end (Judd's flag) come
 * seconds after, so none waits longer than the first.
 */
function endedGameSummary(cue: Extract<GameCues.GameCue, { type: "end" }>) {
	const since = newestSessionKey();
	const summary = refreshFeed()
		.then(() => {
			const built = getFeed()
				.sessions.filter(
					(session) => !session.compacted && session.key >= since,
				)
				.flatMap((session) => session.built)
				.findLast((candidate) => isMatchAt(candidate.match, cue.t));

			return built ? gameSummary(built, { isKnockout: !cue.isTimeUp }) : null;
		})
		.catch(() => null);
	const timeout = new Promise<null>((resolve) =>
		setTimeout(() => resolve(null), SUMMARY_TIMEOUT_MS),
	);

	return Promise.race([summary, timeout]);
}

async function postSignal(signal: BroadcastGameSignal): Promise<void> {
	const target = snapshot.target;
	if (!target) return;

	try {
		const response = await fetch(broadcastGameUrl(target), {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(signal),
		});
		if (!response.ok) throw new Error(`HTTP ${response.status}`);
		if (snapshot.error) set({ error: null });
	} catch (error) {
		set({
			error: `Couldn't tell the broadcast ${SIGNAL_DESCRIPTIONS[signal.type]} (${error instanceof Error ? error.message : String(error)})`,
		});
	}
}

/** Whether the match was seen around `t`, its times being whole seconds. */
function isMatchAt(
	match: { startsAt: number | null; endsAt: number | null },
	t: number,
) {
	return (
		match.startsAt !== null &&
		match.endsAt !== null &&
		match.startsAt <= t &&
		t < match.endsAt + 1
	);
}
