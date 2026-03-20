import type { LoaderFunctionArgs } from "react-router";
import { z } from "zod";
import { db } from "~/db/sql";
import { notFoundIfFalsy, parseParams } from "~/utils/remix.server";
import { id } from "~/utils/zod";
import type { GetCastedTournamentMatchesResponse } from "../schema";

const paramsSchema = z.object({
	id,
});

export const loader = async ({ params }: LoaderFunctionArgs) => {
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
				channel: match.twitchAccount
					? { type: "TWITCH" as const, channelId: match.twitchAccount }
					: match.youtubeChannel
						? { type: "YOUTUBE" as const, channelId: match.youtubeChannel }
						: null,
			})) ?? [],
		future:
			tournament.castedMatchesInfo?.lockedMatches.map((matchId) => ({
				matchId: matchId,
				channel: null,
			})) ?? [],
	};

	return Response.json(result);
};
