import { ServerConfig } from "~/config.server";
import type { Tournament } from "~/features/tournament-bracket/core/Tournament";
import { LRUCache } from "~/modules/cache";
import * as TournamentStationRepository from "../TournamentStationRepository.server";
import * as EtaSimulation from "./EtaSimulation";

/** Simulations older than this run again, the sets underway have moved on since. */
const CACHE_TTL_MS = 60_000;

type CacheEntry = {
	/** The instance the simulation ran on, a new one means the tournament's data changed. */
	tournament: Tournament;
	computedAt: number;
	result: EtaSimulation.EtaSimulationResult;
};

const cache = new LRUCache<number, CacheEntry>({ max: 100 });

/**
 * ETAs of a LAN tournament's matches and brackets yet to start ({@link EtaSimulation}), `null` for an online
 * tournament. Kept until the tournament's data changes (a new shared instance), its stations or their queues
 * change ({@link clearTournamentEtasCache}) or a minute has passed.
 */
export async function tournamentEtas(
	tournament: Tournament,
): Promise<EtaSimulation.EtaSimulationResult | null> {
	if (!tournament.isLan) return null;

	const tournamentId = tournament.ctx.id;
	const now = Date.now();
	const cached = cache.get(tournamentId);
	if (
		!ServerConfig.disableCache &&
		cached?.tournament === tournament &&
		now - cached.computedAt < CACHE_TTL_MS
	) {
		return cached.result;
	}

	const stations =
		await TournamentStationRepository.findAllByTournamentId(tournamentId);
	const result = EtaSimulation.simulate({
		tournament,
		stationIds: stations.map((station) => station.id),
		placements:
			await TournamentStationRepository.findMatchPlacementsByTournamentId(
				tournamentId,
			),
		now,
	});
	cache.set(tournamentId, { tournament, computedAt: now, result });

	return result;
}

/** Drops the tournament's cached ETAs, call after its stations or the matches queued on them change. */
export function clearTournamentEtasCache(tournamentId: number) {
	cache.delete(tournamentId);
}
