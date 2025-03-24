import type { LoaderFunctionArgs } from "@remix-run/node";
import { tournamentData } from "~/features/tournament-bracket/core/Tournament.server";
import { notFoundIfFalsy } from "~/utils/remix.server";
import { streamsByTournamentId } from "../core/streams.server";
import { tournamentIdFromParams } from "../tournament-utils";

export type TournamentStreamsLoader = typeof loader;

export const loader = async ({ params }: LoaderFunctionArgs) => {
	const tournamentId = tournamentIdFromParams(params);
	const tournament = notFoundIfFalsy(await tournamentData({ tournamentId }));

	return {
		streams: await streamsByTournamentId(tournament.ctx),
	};
};
