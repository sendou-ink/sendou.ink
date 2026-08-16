import type { LoaderFunctionArgs } from "react-router";
import { z } from "zod";
import * as TournamentMatchRepository from "~/features/tournament-match/TournamentMatchRepository.server";
import { parseParams } from "~/utils/remix.server";
import { id } from "~/utils/zod";
import type { GetTournamentPlayersResponse } from "../schema";

const paramsSchema = z.object({
	id,
});

export const loader = async ({ params }: LoaderFunctionArgs) => {
	const { id } = parseParams({
		params,
		schema: paramsSchema,
	});

	const participants: GetTournamentPlayersResponse =
		await TournamentMatchRepository.findUserParticipationByTournamentId(id);

	return Response.json(participants);
};
