import type { Tournament } from "~/features/tournament-bracket/core/Tournament";
import * as TournamentStationRepository from "../TournamentStationRepository.server";
import * as MatchStations from "./MatchStations";
import { notifyStationsChanged } from "./notifyStationsChanged.server";

/**
 * A reopened match keeps its place at the front of its station's queue, where finished matches stay, which
 * would put it ahead of the match played there now. Moves it right behind that one instead, so it's played next.
 * Takes the tournament as it is after the reopen.
 */
export async function requeueReopenedMatch({
	tournament,
	matchId,
}: {
	tournament: Tournament;
	matchId: number;
}) {
	if (!tournament.isLan) return;

	const placements =
		await TournamentStationRepository.findMatchPlacementsByTournamentId(
			tournament.ctx.id,
		);
	const stationId = placements.find(
		(placement) => placement.matchId === matchId,
	)?.stationId;
	if (stationId === null || stationId === undefined) return;

	const othersUnfinished = placements.filter((placement) => {
		const status = MatchStations.queuedMatchStatus(
			tournament,
			placement.matchId,
		);

		return (
			placement.stationId === stationId &&
			placement.matchId !== matchId &&
			status !== null &&
			status !== "COMPLETED"
		);
	});
	const nowMatchId = MatchStations.nowMatchIdByStationId({
		tournament,
		placements: othersUnfinished,
	}).get(stationId);
	const nowIdx = othersUnfinished.findIndex(
		(placement) => placement.matchId === nowMatchId,
	);

	await TournamentStationRepository.reorderQueuedMatch({
		matchId,
		index: nowIdx + 1,
	});
	notifyStationsChanged({ tournament, matchIds: [matchId] });
}
