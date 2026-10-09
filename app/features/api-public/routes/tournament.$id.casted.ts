import type { LoaderFunctionArgs } from "react-router";
import { db } from "~/db/sql";
import { notFoundIfNullish, parseParams } from "~/utils/remix.server";
import { idObject } from "~/utils/schema";
import type { GetCastedTournamentMatchesResponse } from "../schema";

export const loader = async ({ params }: LoaderFunctionArgs) => {
	const { id: tournamentId } = parseParams({
		params,
		schema: idObject,
	});

	const tournament = notFoundIfNullish(
		await db
			.selectFrom("Tournament")
			.select(["Tournament.castedMatchesInfo"])
			.where("Tournament.id", "=", tournamentId)
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
			tournament.castedMatchesInfo?.lockedMatches.map((lm) => ({
				matchId: lm.matchId,
				channel: {
					type: "TWITCH" as const,
					channelId: lm.twitchAccount,
				},
			})) ?? [],
	};

	return Response.json(result);
};
