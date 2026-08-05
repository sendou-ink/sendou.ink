import type { LoaderFunctionArgs } from "react-router";
import {
	fetchTournamentStreams,
	tournamentFromParams,
} from "~/features/tournament-bracket/core/Tournament.server";
import type { SerializeFrom } from "~/utils/remix";

export type TournamentStreamsLoaderData = SerializeFrom<typeof loader>;

export const loader = async ({ params }: LoaderFunctionArgs) => {
	const { tournamentId } = await tournamentFromParams(params, { for: "view" });

	return { streams: await fetchTournamentStreams(tournamentId) };
};
