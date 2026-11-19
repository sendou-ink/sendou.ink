import type { LoaderFunctionArgs } from "react-router";
import { db } from "~/db/sql";
import * as LiveStream from "~/features/live-streams/core/LiveStream";
import * as TournamentRepository from "~/features/tournament/TournamentRepository.server";
import { notFoundIfNullish, parseParams } from "~/utils/remix.server";
import { idObject } from "~/utils/schema";
import type { GetTournamentStreamsResponse } from "../schema";

export const loader = async ({ params }: LoaderFunctionArgs) => {
	const { id: tournamentId } = parseParams({
		params,
		schema: idObject,
	});

	notFoundIfNullish(
		await db
			.selectFrom("Tournament")
			.select("Tournament.id")
			.where("Tournament.id", "=", tournamentId)
			.executeTakeFirst(),
	);

	const { participantStreams, castStreams } =
		await TournamentRepository.findStreamsByTournamentId(tournamentId);

	const result: GetTournamentStreamsResponse = [
		...participantStreams.map((stream) => ({
			type: "PLAYER" as const,
			userId: stream.userId,
			platform: stream.platform,
			channelId: stream.account,
			url: LiveStream.url(stream),
			viewerCount: stream.viewerCount,
		})),
		...castStreams.map((stream) => ({
			type: "CAST" as const,
			platform: stream.platform,
			channelId: stream.account,
			url: LiveStream.url(stream),
			viewerCount: stream.viewerCount,
		})),
	].sort((a, b) => b.viewerCount - a.viewerCount);

	return Response.json(result);
};
