/**
 * Live sessions past `SESSION_COMPACT_AFTER_MS`, one record per game: the
 * match frozen as it was built plus the source events `compactSources` keeps.
 * A session's raw events (and frames) leave the `events` store in the same
 * transaction its games arrive here, so it is always in exactly one of them.
 */
import type { BuiltMatch } from "../core/match-builder";
import type { ScannerMatch } from "../core/scanner-match";
import {
	COMPACTED_MATCHES_STORE,
	EVENTS_STORE,
	FRAMES_STORE,
	readwrite,
	tx,
} from "./db";
import type { SendStatus, StoredEvent } from "./events";

export interface CompactedMatch {
	/** the first kept source's id — the card key and upload selectors' id */
	id: number;
	/** the session the game was played in, as its raw events split it */
	session: {
		/** the session key — its URL id and its clips' `sessionKey` */
		key: number;
		endedAt: number;
		/** stream second the session's positions count from */
		originT: number;
	};
	/** the game's position in its session, 0-based */
	index: number;
	match: ScannerMatch;
	/** chronological; each carries the match's send status */
	sources: StoredEvent[];
}

/** A compacted game as the views and uploads take a built one. */
export function compactedBuilt(
	compacted: CompactedMatch,
): BuiltMatch<StoredEvent> {
	return { match: compacted.match, sources: compacted.sources };
}

/** Stores the games and deletes the raw events (and frames) they were built from, in one transaction. */
export function compactSessions(
	matches: readonly CompactedMatch[],
	eventIds: readonly number[],
): Promise<void> {
	return readwrite(
		[COMPACTED_MATCHES_STORE, EVENTS_STORE, FRAMES_STORE],
		(transaction) => {
			const compacted = transaction.objectStore(COMPACTED_MATCHES_STORE);
			for (const match of matches) {
				compacted.put(match);
			}
			const events = transaction.objectStore(EVENTS_STORE);
			const frames = transaction.objectStore(FRAMES_STORE);
			for (const id of eventIds) {
				events.delete(id);
				frames.delete(id);
			}
		},
	);
}

/** Games of the sessions keyed at or after `since` (every compacted game by default), chronological. */
export async function listCompactedMatches(
	since = 0,
): Promise<CompactedMatch[]> {
	const matches = await tx(
		COMPACTED_MATCHES_STORE,
		"readonly",
		(store) =>
			store
				.index("sessionKey")
				.getAll(IDBKeyRange.lowerBound(since)) as IDBRequest<CompactedMatch[]>,
	);
	return matches.sort(
		(a, b) => a.session.key - b.session.key || a.index - b.index,
	);
}

/** Sets (or clears) the send status of the given games, on every source they kept. */
export function updateCompactedMatchesSend(
	ids: readonly number[],
	send: SendStatus | undefined,
): Promise<void> {
	return readwrite([COMPACTED_MATCHES_STORE], (transaction) => {
		const store = transaction.objectStore(COMPACTED_MATCHES_STORE);
		for (const id of ids) {
			const get = store.get(id) as IDBRequest<CompactedMatch | undefined>;
			get.onsuccess = () => {
				const record = get.result;
				if (!record) return; // deleted meanwhile
				for (const source of record.sources) {
					if (send) source.send = send;
					else delete source.send;
				}
				store.put(record);
			};
		}
	});
}

/** Deletes every game of the given sessions. */
export function deleteCompactedSessions(
	keys: readonly number[],
): Promise<void> {
	return readwrite([COMPACTED_MATCHES_STORE], (transaction) => {
		const index = transaction
			.objectStore(COMPACTED_MATCHES_STORE)
			.index("sessionKey");
		for (const key of keys) {
			const req = index.openCursor(IDBKeyRange.only(key));
			req.onsuccess = () => {
				const cursor = req.result;
				if (!cursor) return;
				cursor.delete();
				cursor.continue();
			};
		}
	});
}
