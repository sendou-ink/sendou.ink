import type { LoaderFunctionArgs } from "react-router";
import * as v from "valibot";
import * as TournamentMatchRepository from "~/features/tournament-match/TournamentMatchRepository.server";
import { parseParams } from "~/utils/remix.server";
import { id } from "~/utils/schema";
import type { GetTournamentPlayersResponse } from "../schema";

const paramsSchema = v.object({
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
