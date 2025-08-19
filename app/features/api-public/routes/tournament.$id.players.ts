import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { cors } from "remix-utils/cors";
import { z } from "zod/v4";
import { playersThatPlayedByTournamentId } from "~/features/tournament-bracket/queries/playersThatPlayedByTeamId.server";
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

	const players = playersThatPlayedByTournamentId(id);

	const result: GetTournamentPlayersResponse = players.map((player) => ({
		userId: player.id,
		name: player.username,
		discordId: player.discordId,
		discordAvatar: player.discordAvatar,
		customUrl: player.customUrl,
		country: player.country,
		tournamentTeamId: player.tournamentTeamId,
	}));

	return await cors(request, json(result));
};