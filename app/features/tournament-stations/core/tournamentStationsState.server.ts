import { ServerConfig } from "~/config.server";
import type { Tournament } from "~/features/tournament-bracket/core/Tournament";
import { LRUCache } from "~/modules/cache";
import * as TournamentStationRepository from "../TournamentStationRepository.server";
import * as EtaSimulation from "./EtaSimulation";
import * as MatchStations from "./MatchStations";

/** Simulations older than this run again, the sets underway have moved on since. */
const CACHE_TTL_MS = 60_000;

export interface TournamentStationsState {
	/** In their order. */
	stations: Awaited<
		ReturnType<typeof TournamentStationRepository.findAllByTournamentId>
	>;
	/** Each station's queue in order, finished matches included, and the matches kept in Waiting. */
	placements: Awaited<
		ReturnType<
			typeof TournamentStationRepository.findMatchPlacementsByTournamentId
		>
	>;
	/** Station of each unfinished match queued on one, see {@link MatchStations.byMatchId}. */
	stationByMatchId: Map<number, MatchStations.MatchStation>;
	etas: EtaSimulation.EtaSimulationResult;
}

type CacheEntry = {
	/** The instance the simulation ran on, a new one means the tournament's data changed. */
	tournament: Tournament;
	computedAt: number;
	state: TournamentStationsState;
};

const cache = new LRUCache<number, CacheEntry>({ max: 100 });

/**
 * Stations of a LAN tournament, where its matches are queued and when they are expected to start
 * ({@link EtaSimulation}), `null` for an online tournament. Kept until the tournament's data changes (a new shared
 * instance), its stations or their queues change ({@link clearTournamentStationsStateCache}) or a minute has passed.
 */
export async function tournamentStationsState(
	tournament: Tournament,
): Promise<TournamentStationsState | null> {
	if (!tournament.isLan) return null;

	const tournamentId = tournament.ctx.id;
	const now = Date.now();
	const cached = cache.get(tournamentId);
	if (
		!ServerConfig.disableCache &&
		cached?.tournament === tournament &&
		now - cached.computedAt < CACHE_TTL_MS
	) {
		return cached.state;
	}

	const stations =
		await TournamentStationRepository.findAllByTournamentId(tournamentId);
	const placements =
		await TournamentStationRepository.findMatchPlacementsByTournamentId(
			tournamentId,
		);
	const state: TournamentStationsState = {
		stations,
		placements,
		stationByMatchId: MatchStations.byMatchId({
			tournament,
			stations,
			placements,
		}),
		etas: EtaSimulation.simulate({
			tournament,
			stationIds: stations.map((station) => station.id),
			placements,
			now,
		}),
	};
	cache.set(tournamentId, { tournament, computedAt: now, state });

	return state;
}

/** Drops the tournament's cached state, call after its stations or the matches queued on them change. */
export function clearTournamentStationsStateCache(tournamentId: number) {
	cache.delete(tournamentId);
}
