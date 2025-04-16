import type { LoaderFunctionArgs } from "@remix-run/node";
import { tournamentData } from "~/features/tournament-bracket/core/Tournament.server";
import { notFoundIfFalsy, parseParams } from "~/utils/remix.server";
import { idObject } from "~/utils/zod";
import { streamsByTournamentId } from "../core/streams.server";

export type TournamentStreamsLoader = typeof loader;

export const loader = async ({ params }: LoaderFunctionArgs) => {
	const { id: tournamentId } = parseParams({
		params,
		schema: idObject,
	});
	const tournament = notFoundIfFalsy(await tournamentData({ tournamentId }));

	return {
		streams: await streamsByTournamentId(tournament.ctx),
	};
};
