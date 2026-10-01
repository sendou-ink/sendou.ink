/**
 * The live event store as the views see it: every detection, split into
 * sessions (core/sessions.ts) with each session's matches built once per
 * refresh rather than per render. Every saved event asks for a refresh, ~2-3
 * a second during a match; requests landing while one runs coalesce into a
 * single trailing pass. A refresh re-reads only the events saved since the
 * last one unless told otherwise, plus the events a send status write named
 * (`refreshFeedEvents`): a session runs to tens of thousands of events, so
 * the cost of a pass must not grow with it. For the same reason the events
 * read earlier keep their objects, and a match whose events are all the same
 * objects is not built again (`MatchBuildCache`) — it keeps its identity, so
 * its card skips rendering too. Refreshes also compact the sessions that
 * ended `SESSION_COMPACT_AFTER_MS` ago (store/compacted-matches.ts) and apply
 * retention to the compacted ones.
 */
import { useSyncExternalStore } from "react";
import * as R from "remeda";
import {
	type BuiltMatch,
	buildScannerMatches,
	invalidObjectiveEvents,
	type MatchBuildCache,
} from "../core/match-builder";
import {
	compactSources,
	expiredCompactedSessionKeys,
	SESSION_COMPACT_AFTER_MS,
	SESSION_GAP_MS,
	type SessionSummary,
	sessionKey,
	sessionSummary,
	splitSessions,
} from "../core/sessions";
import {
	type CompactedMatch,
	compactedBuilt,
	compactSessions,
	deleteCompactedSessions,
	listCompactedMatches,
} from "../store/compacted-matches";
import {
	deleteEvents,
	getEvents,
	listEvents,
	type StoredEvent,
} from "../store/events";

export interface LiveSession {
	/** the first event's detection time — the URL id */
	key: number;
	/** its games are frozen as built and `events` holds only what compaction kept */
	compacted: boolean;
	/** oldest first */
	events: StoredEvent[];
	/** chronological */
	built: BuiltMatch<StoredEvent>[];
	/** `built` plus the unbacked kill-feed stretches (match-builder.ts), chronological — clip material only */
	clipMatches: BuiltMatch<StoredEvent>[];
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

/** How far behind the last read's start the next one reaches: a save stamped just before a read can commit just after it. */
const READ_OVERLAP_MS = 5_000;

let snapshot: FeedSnapshot = EMPTY;
const listeners = new Set<() => void>();
let running = false;
/** the earliest `since` requested while a refresh was running */
let pendingSince: number | null = null;
/** events to re-read wherever they sit, rewritten since they were read */
const pendingIds = new Set<number>();
/** when the read that last covered every event up to then started */
let readThrough = 0;
/** callers waiting on a refresh that has not been read yet */
let waiters: (() => void)[] = [];
/** an older session's events don't change, so its build is kept */
const buildCache = new Map<number, { signature: string; built: LiveSession }>();
const matchCache: MatchBuildCache<StoredEvent> = new WeakMap();
/** the raw events the snapshot's not yet compacted sessions were built from */
let rawEvents: StoredEvent[] = [];
/** the compacted sessions, by key */
const compactedSessions = new Map<number, LiveSession>();

/**
 * Re-reads the events detected at or after `since` (a session's key, 0 for
 * everything) and keeps the older ones as they are. Defaults to the events
 * saved since the last read — everything before the feed first loads.
 * Resolves once a read covering the request has landed (or failed).
 */
export function refreshFeed(
	since = readThrough - READ_OVERLAP_MS,
): Promise<void> {
	pendingSince = Math.min(pendingSince ?? since, since);
	const landed = new Promise<void>((resolve) => waiters.push(resolve));
	if (running) return landed;
	running = true;
	void (async () => {
		let covered: (() => void)[] = [];
		let ids: number[] = [];
		try {
			while (pendingSince !== null) {
				const from = pendingSince;
				pendingSince = null;
				ids = [...pendingIds];
				pendingIds.clear();
				covered = waiters;
				waiters = [];
				const startedAt = Date.now();
				const [loaded, reread, loadedCompacted] = await Promise.all([
					listEvents(from),
					getEvents(ids),
					listCompactedMatches(from),
				]);
				if (from <= readThrough) readThrough = startedAt;
				const replaced = new Set([...ids, ...loaded.map((event) => event.id!)]);
				rawEvents = [
					...rawEvents.filter(
						(event) => event.detectedAt < from && !replaced.has(event.id!),
					),
					...reread.filter((event) => event.detectedAt < from),
					...loaded,
				];
				ids = [];
				for (const key of compactedSessions.keys()) {
					if (key >= from) compactedSessions.delete(key);
				}
				addCompactedSessions(loadedCompacted);
				snapshot = { loaded: true, sessions: await toSessions() };
				for (const listener of listeners) listener();
				for (const resolve of covered) resolve();
				covered = [];
			}
		} catch {
			pendingSince = null;
			for (const id of ids) pendingIds.add(id);
			snapshot = { loaded: true, sessions: snapshot.sessions };
			for (const listener of listeners) listener();
		} finally {
			running = false;
			for (const resolve of [...covered, ...waiters]) resolve();
			waiters = [];
		}
	})();
	return landed;
}

/**
 * Re-reads the given events wherever they sit (along with what was saved
 * since the last read), after a write changed them in the store.
 */
export function refreshFeedEvents(ids: readonly number[]): Promise<void> {
	for (const id of ids) pendingIds.add(id);
	return refreshFeed();
}

/**
 * The newest session's key, 0 before the feed loads. Reading from here always
 * covers the session a capture is adding to, even one its latest event just
 * started.
 */
export function newestSessionKey(): number {
	return snapshot.loaded ? (snapshot.sessions.at(-1)?.key ?? 0) : 0;
}

export function useFeed(): FeedSnapshot {
	return useSyncExternalStore(subscribe, getFeed, () => EMPTY);
}

export function getFeed(): FeedSnapshot {
	if (!snapshot.loaded && !running) refreshFeed();
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

/**
 * Every session oldest first: the raw ones built from `rawEvents`, less those
 * this pass compacts, then the compacted ones retention keeps.
 */
async function toSessions(): Promise<LiveSession[]> {
	const now = Date.now();
	const raw = await rawSessions(rawEvents);
	const ripe = raw.filter(
		(session) => now - session.endedAt > SESSION_COMPACT_AFTER_MS,
	);
	if (ripe.length > 0) await compact(ripe);
	const kept = raw.filter((session) => !ripe.includes(session));

	const expired = expiredCompactedSessionKeys(
		[...compactedSessions.values()],
		kept.length,
		now,
	);
	if (expired.length > 0) {
		await deleteCompactedSessions(expired);
		for (const key of expired) compactedSessions.delete(key);
	}

	return [...compactedSessions.values(), ...kept].sort((a, b) => a.key - b.key);
}

async function compact(sessions: readonly LiveSession[]): Promise<void> {
	const matches: CompactedMatch[] = sessions.flatMap((session) =>
		session.built.map((built, index) => {
			const sources = compactSources(built.sources).map((event) => ({
				...event,
				hasFrame: false,
			}));
			return {
				id: sources[0]!.id!,
				session: {
					key: session.key,
					endedAt: session.endedAt,
					originT: session.originT,
				},
				index,
				match: built.match,
				sources,
			};
		}),
	);
	const eventIds = new Set(
		sessions.flatMap((session) => session.events.map((event) => event.id!)),
	);
	await compactSessions(matches, [...eventIds]);
	rawEvents = rawEvents.filter((event) => !eventIds.has(event.id!));
	addCompactedSessions(matches);
}

function addCompactedSessions(matches: readonly CompactedMatch[]): void {
	for (const games of Object.values(
		R.groupBy(matches, (match) => match.session.key),
	)) {
		const { session } = games[0];
		const built = games
			.toSorted((a, b) => a.index - b.index)
			.map(compactedBuilt);
		compactedSessions.set(session.key, {
			key: session.key,
			compacted: true,
			events: built.flatMap((b) => b.sources).toSorted((a, b) => a.t - b.t),
			built,
			clipMatches: built,
			summary: sessionSummary(built.map((b) => b.match)),
			startedAt: session.key,
			endedAt: session.endedAt,
			originT: session.originT,
		});
	}
}

async function rawSessions(events: StoredEvent[]): Promise<LiveSession[]> {
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
		let kept = sessionEvents;
		let sorted = kept.toSorted(
			(a, b) => a.t - b.t || (a.id ?? 0) - (b.id ?? 0),
		);
		let clipMatches = buildScannerMatches(sorted, matchCache, {
			unbacked: true,
		});
		let built = clipMatches.filter((b) => !b.unbacked);
		// objective reads grouped into a match whose mode rules their overlay out
		// slipped past the live block (e.g. the mode read arrived after them) —
		// delete them
		const invalid = invalidObjectiveEvents(built);
		if (invalid.length > 0) {
			await deleteEvents(
				invalid
					.map((event) => event.id)
					.filter((id): id is number => id !== undefined),
			);
			const invalidSet = new Set(invalid);
			rawEvents = rawEvents.filter((event) => !invalidSet.has(event));
			kept = kept.filter((event) => !invalidSet.has(event));
			sorted = sorted.filter((event) => !invalidSet.has(event));
			clipMatches = buildScannerMatches(sorted, matchCache, {
				unbacked: true,
			});
			built = clipMatches.filter((b) => !b.unbacked);
		}
		const session: LiveSession = {
			key,
			compacted: false,
			events: sorted,
			built,
			clipMatches,
			summary: sessionSummary(built.map((b) => b.match)),
			startedAt: key,
			endedAt: sessionEvents.at(-1)!.detectedAt,
			originT: sorted[0]!.t,
		};
		buildCache.set(key, { signature: signatureOf(kept), built: session });
		sessions.push(session);
	}
	for (const key of buildCache.keys()) {
		if (!seen.has(key)) buildCache.delete(key);
	}
	return sessions;
}

/** Changes when an event joins, leaves, moves (a sampled run's trailing read) or its send status moves. */
function signatureOf(events: readonly StoredEvent[]): string {
	let sends = 0;
	let latest = 0;
	let latestT = Number.NEGATIVE_INFINITY;
	for (const event of events) {
		latestT = Math.max(latestT, event.t);
		if (event.send) {
			sends++;
			latest = Math.max(latest, event.send.at);
		}
	}
	return `${events.length}:${events.at(-1)?.id ?? 0}:${latestT}:${sends}:${latest}`;
}
