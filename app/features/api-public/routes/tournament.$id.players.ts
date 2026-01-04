import type { LoaderFunctionArgs } from "react-router";
import { z } from "zod";
import * as TournamentMatchRepository from "~/features/tournament-bracket/TournamentMatchRepository.server";
import { parseParams } from "~/utils/remix.server";
import { id } from "~/utils/zod";
import { requireBearerAuth } from "../api-public-utils.server";
import type { GetTournamentPlayersResponse } from "../schema";

const paramsSchema = z.object({
	id,
});

export const loader = async ({ params, request }: LoaderFunctionArgs) => {
	requireBearerAuth(request);

	const { id } = parseParams({
		params,
		schema: paramsSchema,
	});

	const participants: GetTournamentPlayersResponse =
		await TournamentMatchRepository.userParticipationByTournamentId(id);

	return Response.json(participants);
};
