import type { LoaderFunctionArgs } from "@remix-run/node";
import { tournamentDataCached } from "~/features/tournament-bracket/core/Tournament.server";
import { tournamentTeamPageParamsSchema } from "~/features/tournament-bracket/tournament-bracket-schemas.server";
import { parseParams } from "~/utils/remix.server";
import { tournamentTeamSets, winCounts } from "../core/sets.server";

export const loader = async ({ params }: LoaderFunctionArgs) => {
	const { id: tournamentId, tid: tournamentTeamId } = parseParams({
		params,
		schema: tournamentTeamPageParamsSchema,
	});

	const tournament = await tournamentDataCached({ tournamentId });
	if (
		!tournament ||
		!tournament.ctx.teams.some((t) => t.id === tournamentTeamId)
	) {
		throw new Response(null, { status: 404 });
	}

	// TODO: could be inferred from tournament data (winCounts too)
	const sets = tournamentTeamSets({ tournamentTeamId, tournamentId });

	return {
		tournamentTeamId,
		sets,
		winCounts: winCounts(sets),
	};
};
