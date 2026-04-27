import type { LoaderFunctionArgs } from "react-router";
import { tournamentDataCached } from "~/features/tournament-bracket/core/Tournament.server";
import * as TournamentMatchRepository from "~/features/tournament-bracket/TournamentMatchRepository.server";
import { tournamentTeamPageParamsSchema } from "~/features/tournament-bracket/tournament-bracket-schemas.server";
import { parseParams } from "~/utils/remix.server";
import { tournamentTeamSets, winCounts } from "../core/sets.server";
import { findRoundsByTournamentId } from "../queries/findRoundsByTournamentId.server";

export const loader = async ({ params }: LoaderFunctionArgs) => {
	const { id: tournamentId, tid: tournamentTeamId } = parseParams({
		params,
		schema: tournamentTeamPageParamsSchema,
	});

	const tournament = await tournamentDataCached({ tournamentId });
	if (!tournament?.ctx.teams.some((t) => t.id === tournamentTeamId)) {
		throw new Response(null, { status: 404 });
	}

	const setHistory =
		await TournamentMatchRepository.findByTournamentTeamId(tournamentTeamId);
	const allRounds = findRoundsByTournamentId(tournamentId);

	const sets = tournamentTeamSets({ sets: setHistory, allRounds });

	return {
		tournamentTeamId,
		sets,
		winCounts: winCounts(sets),
	};
};
