import type { LoaderFunctionArgs } from "react-router";
import { tournamentData } from "~/features/tournament-bracket/core/Tournament.server";
import { notFoundIfFalsy, parseParams } from "~/utils/remix.server";
import { idObject } from "~/utils/zod";

export type TournamentStreamsLoader = typeof loader;

// xxx: deprecate loader
export const loader = async ({ params }: LoaderFunctionArgs) => {
	const { id: tournamentId } = parseParams({
		params,
		schema: idObject,
	});
	const tournament = notFoundIfFalsy(await tournamentData({ tournamentId }));

	const memberStreams = tournament.ctx.teams
		.filter((team) => team.checkIns.length > 0)
		.flatMap((team) => team.members)
		.filter((member) => member.streamTwitch)
		.map((member) => ({
			thumbnailUrl: member.streamThumbnailUrl!,
			twitchUserName: member.streamTwitch!,
			viewerCount: member.streamViewerCount!,
			userId: member.userId,
		}));

	const castStreams = tournament.ctx.castStreams.map((stream) => ({
		thumbnailUrl: stream.thumbnailUrl,
		twitchUserName: stream.twitch!,
		viewerCount: stream.viewerCount,
		userId: null as number | null,
	}));

	const streams = [...memberStreams, ...castStreams].sort(
		(a, b) => b.viewerCount - a.viewerCount,
	);

	return { streams };
};
