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
