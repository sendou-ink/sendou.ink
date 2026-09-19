/**
 * The live event store as the views see it: every detection, split into
 * sessions (core/sessions.ts) with each session's matches built once per
 * refresh rather than per render. Every saved event asks for a refresh, ~2-3
 * a second during a match; requests landing while one runs coalesce into a
 * single trailing pass.
 */
import { useSyncExternalStore } from "react";
import {
	type BuiltMatch,
	buildScannerMatches,
	invalidObjectiveEvents,
} from "../core/match-builder";
import {
	SESSION_GAP_MS,
	type SessionSummary,
	sessionKey,
	sessionSummary,
	splitSessions,
} from "../core/sessions";
import { deleteEvents, listEvents, type StoredEvent } from "../store/events";

export interface LiveSession {
	/** the first event's detection time — the URL id */
	key: number;
	/** oldest first */
	events: StoredEvent[];
	/** chronological */
	built: BuiltMatch<StoredEvent>[];
	summary: SessionSummary;
	startedAt: number;
	endedAt: number;
	/** stream second the session's positions count from */
	originT: number;
}

export interface FeedSnapshot {
	loaded: boolean;
	/** oldest first */
	sessions: LiveSession[];
}

const EMPTY: FeedSnapshot = { loaded: false, sessions: [] };

let snapshot: FeedSnapshot = EMPTY;
const listeners = new Set<() => void>();
const state = { running: false, queued: false };
/** an older session's events don't change, so its build is kept */
const buildCache = new Map<number, { signature: string; built: LiveSession }>();

export function refreshFeed(): void {
	if (state.running) {
		state.queued = true;
		return;
	}
	state.running = true;
	void (async () => {
		try {
			do {
				state.queued = false;
				const events = await listEvents();
				snapshot = { loaded: true, sessions: await toSessions(events) };
				for (const listener of listeners) listener();
			} while (state.queued);
		} catch {
			snapshot = { loaded: true, sessions: snapshot.sessions };
			for (const listener of listeners) listener();
		} finally {
			state.running = false;
		}
	})();
}

export function useFeed(): FeedSnapshot {
	return useSyncExternalStore(subscribe, getFeed, () => EMPTY);
}

export function getFeed(): FeedSnapshot {
	if (!snapshot.loaded && !state.running) refreshFeed();
	return snapshot;
}

export function subscribeFeed(listener: () => void): () => void {
	listeners.add(listener);
	return () => listeners.delete(listener);
}

const subscribe = subscribeFeed;

/** The session a detection right now would join: the newest, unless the gap has closed it. */
export function currentSession(
	feed: FeedSnapshot,
	now = Date.now(),
): LiveSession | null {
	const newest = feed.sessions.at(-1);
	if (!newest || now - newest.endedAt >= SESSION_GAP_MS) return null;
	return newest;
}

export function findSession(
	feed: FeedSnapshot,
	key: number,
): LiveSession | null {
	return feed.sessions.find((session) => session.key === key) ?? null;
}

async function toSessions(events: StoredEvent[]): Promise<LiveSession[]> {
	const sessions: LiveSession[] = [];
	const seen = new Set<number>();
	for (const sessionEvents of splitSessions(events)) {
		const key = sessionKey(sessionEvents);
		seen.add(key);
		const signature = signatureOf(sessionEvents);
		const cached = buildCache.get(key);
		if (cached?.signature === signature) {
			sessions.push(cached.built);
			continue;
		}
		const sorted = sessionEvents.toSorted(
			(a, b) => a.t - b.t || (a.id ?? 0) - (b.id ?? 0),
		);
		let built = buildScannerMatches(sorted);
		// objective reads grouped into a known non-SZ match slipped past the live
		// block (e.g. the mode read arrived after them) — delete them
		const invalid = invalidObjectiveEvents(built);
		if (invalid.length > 0) {
			await deleteEvents(
				invalid
					.map((event) => event.id)
					.filter((id): id is number => id !== undefined),
			);
			const invalidSet = new Set(invalid);
			built = buildScannerMatches(sorted.filter((e) => !invalidSet.has(e)));
		}
		const session: LiveSession = {
			key,
			events: sorted,
			built,
			summary: sessionSummary(built.map((b) => b.match)),
			startedAt: key,
			endedAt: sessionEvents.at(-1)!.detectedAt,
			originT: sorted[0]!.t,
		};
		buildCache.set(key, { signature, built: session });
		sessions.push(session);
	}
	for (const key of buildCache.keys()) {
		if (!seen.has(key)) buildCache.delete(key);
	}
	return sessions;
}

/** Changes when an event joins, leaves, or its send status moves. */
function signatureOf(events: readonly StoredEvent[]): string {
	let sends = 0;
	let latest = 0;
	for (const event of events) {
		if (event.send) {
			sends++;
			latest = Math.max(latest, event.send.at);
		}
	}
	return `${events.length}:${events.at(-1)?.id ?? 0}:${sends}:${latest}`;
}
