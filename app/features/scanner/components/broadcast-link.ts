/**
 * Links the live capture to the tournament broadcast linked from its
 * dashboard (`broadcastLinkPersisted`): games starting and ending on the
 * capture put the broadcast's scenes waiting for them on air, the start
 * telling the overlay the teams' ink colors first (GameCues, broadcast's
 * `Producer.applyGameSignal`). A cast never shows the results screen that
 * would send its match, so the game ending sends it instead; every other
 * upload goes on as without a link. While capturing, the link holds the
 * broadcast's stream open, which is how the dashboard knows a scanner is on.
 */
import { useSyncExternalStore } from "react";
import type {
	BroadcastGameSignal,
	BroadcastStreamMessage,
} from "~/features/broadcast/broadcast-types";
import {
	broadcastGameUrl,
	broadcastStreamUrl,
} from "~/features/broadcast/broadcast-urls";
import * as PersistedState from "~/modules/persisted-state/persisted-state";
import type { DetectedEvent } from "../core/detectors/types";
import * as GameCues from "../core/GameCues";
import {
	broadcastLinkPersisted,
	type LinkedBroadcast,
	linkedBroadcast,
} from "../scanner-activity";
import { newestSessionKey } from "./events-feed";
import { unsentMatches } from "./sendou-ingest";
import { sendLive, uploadEnabled } from "./upload";

/** How often time passing is checked for a game whose HUD went away. */
const TICK_MS = 1_000;
const REOPEN_DELAY_MS = 5_000;

export interface BroadcastLinkSnapshot {
	target: LinkedBroadcast | null;
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
let tickTimer: ReturnType<typeof setInterval> | null = null;
let reopenTimer: ReturnType<typeof setTimeout> | null = null;

if (typeof window !== "undefined") {
	retarget();
	PersistedState.subscribe(broadcastLinkPersisted, retarget);
}

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
	if (!capturing) {
		disconnect();
		return;
	}

	retarget();
	connect();
}

/** A detector event of the capture, as it came in. */
export function observeEvent(event: DetectedEvent): void {
	if (!snapshot.target || !isCapturing) return;

	advance({ kind: "event", event });
}

/** The capture's map overlay gate passed at `t`: an observer has the map open over the HUD. */
export function observeMapOpen(t: number): void {
	if (!snapshot.target || !isCapturing) return;

	advance({ kind: "mapOpen", t });
}

/** Follows the link as it was changed (here or in another tab) or ran out, a running capture switching over right away. */
function retarget(): void {
	const target = linkedBroadcast();
	if (
		target?.tournamentId === snapshot.target?.tournamentId &&
		target?.slug === snapshot.target?.slug
	) {
		return;
	}

	disconnect();
	set({ ...UNLINKED, target });
	if (isCapturing) connect();
}

function subscribe(listener: () => void): () => void {
	listeners.add(listener);
	return () => listeners.delete(listener);
}

function set(patch: Partial<BroadcastLinkSnapshot>): void {
	snapshot = { ...snapshot, ...patch };
	for (const listener of listeners) listener();
}

function connect(): void {
	disconnect();
	const target = snapshot.target;
	if (!target) return;

	tickTimer = setInterval(
		() => advance({ kind: "tick", t: Date.now() / 1000 }),
		TICK_MS,
	);
	openStream(target);
}

function disconnect(): void {
	if (tickTimer) clearInterval(tickTimer);
	tickTimer = null;
	if (reopenTimer) clearTimeout(reopenTimer);
	reopenTimer = null;
	stream?.close();
	stream = null;
	if (snapshot.isConnected) set({ isConnected: false });
}

function openStream(target: LinkedBroadcast): void {
	stream = new EventSource(broadcastStreamUrl({ ...target, role: "scanner" }));
	stream.onmessage = (event) => {
		if (!snapshot.isConnected) set({ isConnected: true, error: null });

		const message = JSON.parse(event.data) as BroadcastStreamMessage;
		if (message.kind === "reconnect") reopenStream(target, 0);
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

function reopenStream(target: LinkedBroadcast, delayMs: number): void {
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
		void postSignal(
			cue.type === "start"
				? { type: "start", inks: cue.inks }
				: { type: "end" },
		);
		if (cue.type === "end" && uploadEnabled()) {
			void sendLive(
				(built) => isMatchAt(built.match, cue.t) && unsentMatches(built),
				newestSessionKey(),
			);
		}
	}
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
			error: `Couldn't tell the broadcast the game ${signal.type === "start" ? "started" : "ended"} (${error instanceof Error ? error.message : String(error)})`,
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
