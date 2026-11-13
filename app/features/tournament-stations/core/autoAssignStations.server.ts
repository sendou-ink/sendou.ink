import * as ChatSystemMessage from "~/features/chat/ChatSystemMessage.server";
import type { Tournament } from "~/features/tournament-bracket/core/Tournament";
import { refreshTournamentCache } from "~/features/tournament-bracket/core/Tournament.server";
import * as TournamentStationRepository from "../TournamentStationRepository.server";
import { tournamentStationsChannel } from "../tournament-stations-utils";
import * as StationAutoAssignment from "./StationAutoAssignment";

/**
 * Puts the playable matches no one placed on the free stations, see {@link StationAutoAssignment}. Call after a write
 * that can make matches playable or free a station, once the tournament's data cache is cleared. Takes the tournament
 * as loaded before the write: online tournaments return without loading anything.
 */
export async function autoAssignStations(tournament: Tournament) {
	if (!tournament.isLan) return;

	const tournamentId = tournament.ctx.id;
	const current = await refreshTournamentCache(tournamentId);
	if (!current.autoAssignsStations || current.ctx.isFinalized) return;

	const stations =
		await TournamentStationRepository.findAllByTournamentId(tournamentId);
	if (stations.length === 0) return;

	const assignments = StationAutoAssignment.assignments({
		tournament: current,
		stationIds: stations.map((station) => station.id),
		placedMatches:
			await TournamentStationRepository.findMatchPlacementsByTournamentId(
				tournamentId,
			),
	});
	if (assignments.length === 0) return;

	await TournamentStationRepository.insertAutoAssignedMatches(assignments);

	ChatSystemMessage.send({ channel: tournamentStationsChannel(tournamentId) });
}
