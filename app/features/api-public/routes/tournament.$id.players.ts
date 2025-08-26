import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { cors } from "remix-utils/cors";
import { z } from "zod/v4";
import { tournamentParticipantsByTournamentId } from "~/features/tournament-bracket/queries/playersThatPlayedByTeamId.server";
import { parseParams } from "~/utils/remix.server";
import { id } from "~/utils/zod";
import {
	handleOptionsRequest,
	requireBearerAuth,
} from "../api-public-utils.server";
import type { GetTournamentPlayersResponse } from "../schema";

const paramsSchema = z.object({
	id,
});

export const loader = async ({ params, request }: LoaderFunctionArgs) => {
	await handleOptionsRequest(request);
	requireBearerAuth(request);

	const { id } = parseParams({
		params,
		schema: paramsSchema,
	});

	const participants = await tournamentParticipantsByTournamentId(id);

	const result: GetTournamentPlayersResponse = participants.map(
		(participant) => ({
			userId: participant.userId,
			matchIds: participant.matchIds,
		}),
	);

	return cors(request, json(result));
};
