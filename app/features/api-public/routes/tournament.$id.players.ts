import type { LoaderFunctionArgs } from "react-router";
import * as TournamentMatchRepository from "~/features/tournament-match/TournamentMatchRepository.server";
import { parseParams } from "~/utils/remix.server";
import { idObject } from "~/utils/schema";
import type { GetTournamentPlayersResponse } from "../schema";

export const loader = async ({ params }: LoaderFunctionArgs) => {
	const { id: tournamentId } = parseParams({
		params,
		schema: idObject,
	});

	const participants: GetTournamentPlayersResponse =
		await TournamentMatchRepository.findUserParticipationByTournamentId(
			tournamentId,
		);

	return Response.json(participants);
};
