import type { LoaderFunctionArgs } from "react-router";
import { z } from "zod";
import { tournamentFromDB } from "~/features/tournament-bracket/core/Tournament.server";
import { notFoundIfNullish, parseParams } from "~/utils/remix.server";
import { id } from "~/utils/zod";
import type { GetTournamentBracketStandingsResponse } from "../schema";

const paramsSchema = z.object({
	id,
	bidx: z.coerce.number().int(),
});

export const loader = async ({ params }: LoaderFunctionArgs) => {
	const { id, bidx } = parseParams({ params, schema: paramsSchema });

	const tournament = await tournamentFromDB({
		user: undefined,
		tournamentId: id,
	});

	const bracket = notFoundIfNullish(tournament.bracketByIdx(bidx));
	if (bracket.preview) throw new Response(null, { status: 404 });

	const result: GetTournamentBracketStandingsResponse = {
		standings: bracket.standings.map((standing) => ({
			tournamentTeamId: standing.team.id,
			placement: standing.placement,
			stats: standing.stats,
		})),
	};

	return Response.json(result);
};
