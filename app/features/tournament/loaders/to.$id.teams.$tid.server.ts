import type { LoaderFunctionArgs } from "react-router";
import { getUser } from "~/features/auth/core/user.server";
import {
	requireTournamentVisible,
	tournamentDataCached,
	tournamentSharedCached,
	tournamentTeamsFullCached,
} from "~/features/tournament-bracket/core/Tournament.server";
import { tournamentTeamPageParamsSchema } from "~/features/tournament-bracket/tournament-bracket-schemas.server";
import * as TournamentMatchRepository from "~/features/tournament-match/TournamentMatchRepository.server";
import invariant from "~/utils/invariant";
import type { SerializeFrom } from "~/utils/remix";
import { parseParams } from "~/utils/remix.server";
import * as Standings from "../core/Standings";
import {
	type AllRoundsItem,
	tournamentTeamSets,
	winCounts,
} from "../core/sets.server";

export type TournamentTeamLoaderData = SerializeFrom<typeof loader>;

export const loader = async ({ params }: LoaderFunctionArgs) => {
	const { id: tournamentId, tid: tournamentTeamId } = parseParams({
		params,
		schema: tournamentTeamPageParamsSchema,
	});

	const user = getUser();
	const tournament = await tournamentDataCached({ tournamentId });
	requireTournamentVisible({ ctx: tournament.ctx, user });

	const team = (await tournamentTeamsFullCached({ tournamentId, user })).find(
		(t) => t.id === tournamentTeamId,
	);
	const tournamentHasStarted = (tournament?.data.stage.length ?? 0) > 0;
	if (!team || (tournamentHasStarted && team.checkIns.length === 0)) {
		throw new Response(null, { status: 404 });
	}

	const setHistory =
		await TournamentMatchRepository.findByTournamentTeamId(tournamentTeamId);
	const allRounds: AllRoundsItem[] = tournament.data.round.map((round) => {
		const stage = tournament.data.stage.find((s) => s.id === round.stageId);
		const group = tournament.data.group.find((g) => g.id === round.groupId);
		invariant(stage && group, "Stage or group not found for round");
		invariant(stage.name, "Stage from the database is missing a name");

		return {
			stageId: stage.id,
			stageName: stage.name,
			stageType: stage.type,
			roundNumber: round.number,
			groupNumber: group.number,
		};
	});

	const sets = tournamentTeamSets({ sets: setHistory, allRounds });

	const fullTournament = await tournamentSharedCached(tournamentId);
	const standingsResult = Standings.tournamentStandings(fullTournament);
	const overallStandings = Standings.flattenStandings(standingsResult);
	const undergroundBracketIdx = fullTournament.bracketsMeta.find(
		(bracket) => bracket.isUnderground,
	)?.idx;

	return {
		tournamentTeamId,
		team,
		activePlayers:
			sets.length > 0
				? fullTournament.participatedPlayerUserIdsByTeamId(tournamentTeamId)
				: undefined,
		tournamentName: tournament.ctx.name,
		sets: sets.map((set) => ({
			...set,
			// the layout ships no bracket match data, so the names can't be derived in the view
			matchContextNames: fullTournament.matchContextNamesById(
				set.tournamentMatchId,
			),
		})),
		winCounts: winCounts(sets),
		division:
			standingsResult.type === "multi"
				? (standingsResult.standings.find((div) =>
						div.standings.some(
							(standing) => standing.team.id === tournamentTeamId,
						),
					)?.div ?? null)
				: null,
		placement: overallStandings.find(
			(standing) => standing.team.id === tournamentTeamId,
		)?.placement,
		undergroundPlacement:
			typeof undergroundBracketIdx === "number"
				? fullTournament
						.bracketByIdx(undergroundBracketIdx)
						?.standings.find(
							(standing) => standing.team.id === tournamentTeamId,
						)?.placement
				: undefined,
	};
};
