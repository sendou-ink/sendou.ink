import type { Tournament } from "~/features/tournament-bracket/core/Tournament";
import { refreshTournamentCache } from "~/features/tournament-bracket/core/Tournament.server";
import * as TournamentStationRepository from "../TournamentStationRepository.server";
import { notifyStationsChanged } from "./notifyStationsChanged.server";
import * as StationAutoAssignment from "./StationAutoAssignment";
import { updateStationNotifications } from "./stationNotifications.server";

const passByTournamentId = new Map<number, Promise<void>>();

/**
 * Puts the playable matches no one placed on the free stations, see {@link StationAutoAssignment}, then schedules
 * the notifications telling teams their match's station ({@link updateStationNotifications}). Call after a write
 * that can make matches playable, free a station or move a match, once the tournament's data cache is cleared.
 * Takes the tournament as loaded before the write: online tournaments return without loading anything.
 */
export async function autoAssignStations(tournament: Tournament) {
	if (!tournament.isLan) return;

	const tournamentId = tournament.ctx.id;
	// one at a time per tournament: two passes reading the same free station would both fill it
	const pass = (passByTournamentId.get(tournamentId) ?? Promise.resolve())
		.catch(() => {})
		.then(async () => {
			const current = await refreshTournamentCache(tournamentId);
			await assignFreeStations(current);
			await updateStationNotifications(current);
		})
		.finally(() => {
			if (passByTournamentId.get(tournamentId) === pass) {
				passByTournamentId.delete(tournamentId);
			}
		});
	passByTournamentId.set(tournamentId, pass);

	return pass;
}

async function assignFreeStations(tournament: Tournament) {
	if (!tournament.autoAssignsStations || tournament.ctx.isFinalized) return;

	const tournamentId = tournament.ctx.id;
	const stations =
		await TournamentStationRepository.findAllByTournamentId(tournamentId);
	if (stations.length === 0) return;

	const assignments = StationAutoAssignment.assignments({
		tournament,
		stationIds: stations.map((station) => station.id),
		placedMatches:
			await TournamentStationRepository.findMatchPlacementsByTournamentId(
				tournamentId,
			),
	});
	if (assignments.length === 0) return;

	await TournamentStationRepository.insertAutoAssignedMatches(assignments);
	notifyStationsChanged({
		tournament,
		matchIds: assignments.map((assignment) => assignment.matchId),
	});
}
