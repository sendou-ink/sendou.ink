import cachified from "@epic-web/cachified";
import * as TournamentRepository from "~/features/tournament/TournamentRepository.server";
import { cache, ttl } from "~/utils/cache.server";
import { TOURNAMENT } from "../tournament-constants";

const CACHE_KEY = "pending-check-ins";
const CACHE_TTL_MS = 60 * 1000;

export interface PendingCheckIn {
	tournamentId: number;
	logoUrl: string;
}

/**
 * The tournament the user has to check in to right now, null when none has
 * check-in open. Cached site-wide rather than resolved per user: the header
 * asks on every page load, while the answer only moves as tournaments approach
 * their start.
 */
export async function byUserId(userId: number): Promise<PendingCheckIn | null> {
	return (await cachedByUserId()).get(userId) ?? null;
}

/** Drops the cache so a team checking in (or out) shows in the header without waiting out the TTL. */
export function clearCache() {
	cache.delete(CACHE_KEY);
}

function cachedByUserId() {
	return cachified({
		key: CACHE_KEY,
		cache,
		ttl: ttl(CACHE_TTL_MS),
		getFreshValue: resolveByUserId,
	});
}

async function resolveByUserId() {
	const now = new Date();
	const rows = await TournamentRepository.findPendingCheckInsStartingBetween({
		startsAfter: now,
		startsBefore: new Date(
			now.getTime() + TOURNAMENT.REGULAR_CHECK_IN_WINDOW_MS,
		),
	});

	const result = new Map<number, PendingCheckIn>();
	// rows come in start time order, so the soonest tournament wins a double booking
	for (const row of rows) {
		if (result.has(row.userId)) continue;

		result.set(row.userId, {
			tournamentId: row.tournamentId,
			logoUrl: row.logoUrl,
		});
	}

	return result;
}
