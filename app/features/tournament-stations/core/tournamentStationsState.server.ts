import { ServerConfig } from "~/config.server";
import type { Tournament } from "~/features/tournament-bracket/core/Tournament";
import * as TournamentStationRepository from "../TournamentStationRepository.server";
import * as EtaSimulation from "./EtaSimulation";
import * as MatchStations from "./MatchStations";
import { updateStationNotifications } from "./stationNotifications.server";

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
	/** {@link clearTournamentStationsStateCache} calls of the tournament before it was computed. */
	generation: number;
	computedAt: number;
	state: TournamentStationsState;
};

/**
 * Per instance: a new one means the tournament's data changed. Several instances of the same data live at
 * once (the shared cached one and the running tournaments registry's), each keeps its own entry.
 */
const cache = new WeakMap<Tournament, CacheEntry>();
const generationByTournamentId = new Map<number, number>();
const notificationsCheckedTournamentIds = new Set<number>();

/**
 * Stations of a LAN tournament, where its matches are queued and when they are expected to start
 * ({@link EtaSimulation}), `null` for an online or finalized tournament. Kept until the tournament's data changes
 * (a new instance), its stations or their queues change ({@link clearTournamentStationsStateCache}) or a minute
 * has passed.
 */
export async function tournamentStationsState(
	tournament: Tournament,
): Promise<TournamentStationsState | null> {
	if (!tournament.isLan || tournament.ctx.isFinalized) return null;

	const tournamentId = tournament.ctx.id;
	const now = Date.now();
	const generation = generationByTournamentId.get(tournamentId) ?? 0;
	const cached = cache.get(tournament);
	if (
		!ServerConfig.disableCache &&
		cached?.generation === generation &&
		now - cached.computedAt < CACHE_TTL_MS
	) {
		return cached.state;
	}

	// station notices scheduled before a restart were only kept in memory
	if (!notificationsCheckedTournamentIds.has(tournamentId)) {
		notificationsCheckedTournamentIds.add(tournamentId);
		void updateStationNotifications(tournament);
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
	cache.set(tournament, { generation, computedAt: now, state });

	return state;
}

/** Drops the tournament's cached state, call after its stations or the matches queued on them change. */
export function clearTournamentStationsStateCache(tournamentId: number) {
	generationByTournamentId.set(
		tournamentId,
		(generationByTournamentId.get(tournamentId) ?? 0) + 1,
	);
}
