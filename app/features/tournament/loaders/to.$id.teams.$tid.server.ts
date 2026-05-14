import type { LoaderFunctionArgs } from "react-router";
import { tournamentDataCached } from "~/features/tournament-bracket/core/Tournament.server";
import { tournamentTeamPageParamsSchema } from "~/features/tournament-bracket/tournament-bracket-schemas.server";
import * as TournamentMatchRepository from "~/features/tournament-match/TournamentMatchRepository.server";
import invariant from "~/utils/invariant";
import { parseParams } from "~/utils/remix.server";
import {
	type AllRoundsItem,
	tournamentTeamSets,
	winCounts,
} from "../core/sets.server";

export const loader = async ({ params }: LoaderFunctionArgs) => {
	const { id: tournamentId, tid: tournamentTeamId } = parseParams({
		params,
		schema: tournamentTeamPageParamsSchema,
	});

	const tournament = await tournamentDataCached({ tournamentId });
	const team = tournament?.ctx.teams.find((t) => t.id === tournamentTeamId);
	const tournamentHasStarted = (tournament?.data.stage.length ?? 0) > 0;
	if (!team || (tournamentHasStarted && team.checkIns.length === 0)) {
		throw new Response(null, { status: 404 });
	}

	const setHistory =
		await TournamentMatchRepository.findByTournamentTeamId(tournamentTeamId);
	const allRounds: AllRoundsItem[] = tournament.data.round.map((round) => {
		const stage = tournament.data.stage.find((s) => s.id === round.stage_id);
		const group = tournament.data.group.find((g) => g.id === round.group_id);
		invariant(stage && group, "Stage or group not found for round");

		return {
			stageId: stage.id,
			stageName: stage.name,
			stageType: stage.type,
			roundNumber: round.number,
			groupNumber: group.number,
		};
	});

	const sets = tournamentTeamSets({ sets: setHistory, allRounds });

	return {
		tournamentTeamId,
		sets,
		winCounts: winCounts(sets),
	};
};
