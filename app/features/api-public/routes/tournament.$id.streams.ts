import { sql } from "kysely";
import { jsonArrayFrom } from "kysely/helpers/sqlite";
import type { LoaderFunctionArgs } from "react-router";
import { z } from "zod";
import { db } from "~/db/sql";
import { notFoundIfFalsy, parseParams } from "~/utils/remix.server";
import { id } from "~/utils/zod";
import type { GetTournamentStreamsResponse } from "../schema";

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
			.select([
				jsonArrayFrom(
					db
						.selectFrom("LiveStream")
						.leftJoin(
							"TournamentTeamMember",
							"TournamentTeamMember.userId",
							"LiveStream.userId",
						)
						.leftJoin(
							"TournamentTeam",
							"TournamentTeam.id",
							"TournamentTeamMember.tournamentTeamId",
						)
						.select([
							"LiveStream.userId",
							"LiveStream.twitch",
							"LiveStream.viewerCount",
						])
						.where("TournamentTeam.tournamentId", "=", id),
				).as("playerStreams"),
				jsonArrayFrom(
					db
						.selectFrom("LiveStream")
						.select(["LiveStream.twitch", "LiveStream.viewerCount"])
						.where(
							sql<boolean>`"LiveStream"."twitch" IN (SELECT value FROM json_each("Tournament"."castTwitchAccounts"))`,
						),
				).as("castStreams"),
			])
			.where("Tournament.id", "=", id)
			.executeTakeFirst(),
	);

	const playerStreams: GetTournamentStreamsResponse =
		tournament?.playerStreams.map((stream) => ({
			type: "PLAYER",
			userId: stream.userId!,
			platform: "TWITCH",
			channelId: stream.twitch!,
			viewerCount: stream.viewerCount!,
		})) ?? [];

	const castStreams: GetTournamentStreamsResponse =
		tournament?.castStreams.map((stream) => ({
			type: "CAST",
			platform: "TWITCH",
			channelId: stream.twitch!,
			viewerCount: stream.viewerCount!,
		})) ?? [];

	const result: GetTournamentStreamsResponse = [
		...playerStreams,
		...castStreams,
	].sort((a, b) => b.viewerCount - a.viewerCount);

	return Response.json(result);
};
