import { type LoaderFunctionArgs, json } from "@remix-run/node";
import { cors } from "remix-utils/cors";
import { z } from "zod";
import { db } from "~/db/sql";
import { notFoundIfFalsy, parseParams } from "~/utils/remix.server";
import { id } from "~/utils/zod";
import {
	handleOptionsRequest,
	requireBearerAuth,
} from "../api-public-utils.server";
import type { GetCastedTournamentMatchesResponse } from "../schema";

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

	const tournament = notFoundIfFalsy(
		await db
			.selectFrom("Tournament")
			.select(["Tournament.castedMatchesInfo"])
			.where("Tournament.id", "=", id)
			.executeTakeFirst(),
	);

	const result: GetCastedTournamentMatchesResponse = {
		current:
			tournament.castedMatchesInfo?.castedMatches.map((match) => ({
				matchId: match.matchId,
				channel: {
					type: "TWITCH",
					channelId: match.twitchAccount,
				},
			})) ?? [],
		future:
			tournament.castedMatchesInfo?.lockedMatches.map((matchId) => ({
				matchId: matchId,
				channel: null,
			})) ?? [],
	};

	return await cors(request, json(result));
};
