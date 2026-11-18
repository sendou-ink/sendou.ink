import { tournamentFromDB } from "~/features/tournament-bracket/core/Tournament.server";
import * as StationAutoAssignment from "~/features/tournament-stations/core/StationAutoAssignment";
import * as TournamentStationRepository from "~/features/tournament-stations/TournamentStationRepository.server";
import { defineFactory } from "../core/defineFactory";

type InsertArgs = Parameters<typeof TournamentStationRepository.moveMatch>[0];

/**
 * Queues a match on a station, last in its queue unless `index` says otherwise, as the stations board does.
 * `stationId: null` holds it in the Waiting lane.
 */
export const { create } = defineFactory({
	defaults: () => ({ index: Number.MAX_SAFE_INTEGER }),
	insert: async (args: InsertArgs) => {
		await TournamentStationRepository.moveMatch(args);

		return { matchId: args.matchId, stationId: args.stationId };
	},
});

/**
 * Puts the playable matches no one placed on the tournament's free stations, as auto-assignment does after
 * a score report or a bracket start. Sends no notifications. Returns the matches placed.
 */
export async function autoAssign(tournamentId: number) {
	const tournament = await tournamentFromDB(tournamentId);
	const stations =
		await TournamentStationRepository.findAllByTournamentId(tournamentId);

	const assignments = StationAutoAssignment.assignments({
		tournament,
		stationIds: stations.map((station) => station.id),
		placedMatches:
			await TournamentStationRepository.findMatchPlacementsByTournamentId(
				tournamentId,
			),
	});
	await TournamentStationRepository.insertAutoAssignedMatches(assignments);

	return assignments;
}
