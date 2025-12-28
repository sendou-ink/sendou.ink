import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { cors } from "remix-utils/cors";
import { z } from "zod";
import * as TournamentMatchRepository from "~/features/tournament-bracket/TournamentMatchRepository.server";
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

	const participants: GetTournamentPlayersResponse =
		await TournamentMatchRepository.userParticipationByTournamentId(id);

	return cors(request, json(participants));
};
