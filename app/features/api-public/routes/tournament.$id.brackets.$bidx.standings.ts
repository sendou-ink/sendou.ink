import type { LoaderFunctionArgs } from "react-router";
import * as v from "valibot";
import { tournamentFromDB } from "~/features/tournament-bracket/core/Tournament.server";
import { notFoundIfNullish, parseParams } from "~/utils/remix.server";
import { coerceNumber, id } from "~/utils/schema";
import type { GetTournamentBracketStandingsResponse } from "../schema";

const paramsSchema = v.object({
	id,
	bidx: v.pipe(coerceNumber(), v.integer()),
});

export const loader = async ({ params }: LoaderFunctionArgs) => {
	const { id, bidx } = parseParams({ params, schema: paramsSchema });

	const tournament = await tournamentFromDB(id);

	const bracket = notFoundIfNullish(tournament.bracketByIdx(bidx));
	if (bracket.preview) throw new Response(null, { status: 404 });

	const result: GetTournamentBracketStandingsResponse = {
		finished: bracket.standingsAreFinal,
		standings: bracket.liveStandings.map((standing) => ({
			tournamentTeamId: standing.team.id,
			placement: standing.placement,
			groupId: standing.groupId,
			stats: standing.stats
				? {
						setWins: standing.stats.setWins,
						setLosses: standing.stats.setLosses,
						mapWins: standing.stats.mapWins,
						mapLosses: standing.stats.mapLosses,
						koCount: standing.stats.koCount,
						winsAgainstTied: standing.stats.winsAgainstTied,
						lossesAgainstTied: standing.stats.lossesAgainstTied,
						opponentSetWinPercentage: standing.stats.opponentSetWinPercentage,
						opponentMapWinPercentage: standing.stats.opponentMapWinPercentage,
					}
				: undefined,
		})),
	};

	return Response.json(result);
};
