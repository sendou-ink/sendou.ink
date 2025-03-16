import { type LoaderFunctionArgs, json } from "@remix-run/node";
import { cors } from "remix-utils/cors";
import { z } from "zod";
import { tournamentFromDB } from "~/features/tournament-bracket/core/Tournament.server";
import { notFoundIfFalsy, parseParams } from "~/utils/remix.server";
import { id } from "~/utils/zod";
import {
	handleOptionsRequest,
	requireBearerAuth,
} from "../api-public-utils.server";
import type { GetTournamentBracketStandingsResponse } from "../schema";

const paramsSchema = z.object({
	id,
	bidx: z.coerce.number().int(),
});

export const loader = async ({ params, request }: LoaderFunctionArgs) => {
	await handleOptionsRequest(request);
	requireBearerAuth(request);

	const { id, bidx } = parseParams({ params, schema: paramsSchema });

	const tournament = await tournamentFromDB({
		user: undefined,
		tournamentId: id,
	});

	const bracket = notFoundIfFalsy(tournament.bracketByIdx(bidx));

	const result: GetTournamentBracketStandingsResponse = {
		standings: bracket.standings.map((standing) => ({
			tournamentTeamId: standing.team.id,
			placement: standing.placement,
			stats: standing.stats,
		})),
	};

	return await cors(request, json(result));
};
