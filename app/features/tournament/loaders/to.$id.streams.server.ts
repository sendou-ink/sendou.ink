import type { LoaderFunctionArgs } from "react-router";
import { getUser } from "~/features/auth/core/user.server";
import {
	fetchTournamentStreams,
	requireTournamentVisible,
	tournamentSharedCached,
} from "~/features/tournament-bracket/core/Tournament.server";
import type { SerializeFrom } from "~/utils/remix";
import { parseParams } from "~/utils/remix.server";
import { idObject } from "~/utils/zod";

export type TournamentStreamsLoaderData = SerializeFrom<typeof loader>;

export const loader = async ({ params }: LoaderFunctionArgs) => {
	const { id: tournamentId } = parseParams({ params, schema: idObject });

	const tournament = await tournamentSharedCached(tournamentId);
	requireTournamentVisible({ ctx: tournament.ctx, user: getUser() });

	return { streams: await fetchTournamentStreams(tournamentId) };
};
