import { type LoaderFunctionArgs, redirect } from "react-router";
import { tournamentFromParams } from "~/features/tournament-bracket/core/Tournament.server";
import * as TournamentStationRepository from "~/features/tournament-stations/TournamentStationRepository.server";
import { tournamentAdminPage } from "~/utils/urls";

export const loader = async ({ params }: LoaderFunctionArgs) => {
	const { tournament, tournamentId } = await tournamentFromParams(params, {
		for: "organizer",
	});

	if (!tournament.isLan || tournament.ctx.isFinalized) {
		throw redirect(tournamentAdminPage(tournamentId));
	}

	const placements =
		await TournamentStationRepository.findMatchPlacementsByTournamentId(
			tournamentId,
		);
	const isUnfinished = (matchId: number) =>
		tournament.matchIdToBracketIdx(matchId) !== null &&
		tournament.matchStatusById(matchId) !== "COMPLETED";

	return {
		stations: (
			await TournamentStationRepository.findAllByTournamentId(tournamentId)
		).map((station) => ({
			...station,
			hasQueuedMatches: placements.some(
				(placement) =>
					placement.stationId === station.id && isUnfinished(placement.matchId),
			),
		})),
	};
};
