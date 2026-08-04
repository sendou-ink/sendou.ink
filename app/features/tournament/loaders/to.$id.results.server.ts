import type { LoaderFunctionArgs } from "react-router";
import { getUser } from "~/features/auth/core/user.server";
import * as TournamentRepository from "~/features/tournament/TournamentRepository.server";
import type { Standing } from "~/features/tournament-bracket/core/Bracket";
import {
	requireTournamentVisible,
	tournamentSharedCached,
	tournamentTeamsFullCached,
} from "~/features/tournament-bracket/core/Tournament.server";
import type { SerializeFrom } from "~/utils/remix";
import { parseParams } from "~/utils/remix.server";
import { idObject } from "~/utils/zod";
import * as Standings from "../core/Standings";

export type TournamentResultsLoaderData = SerializeFrom<typeof loader>;

export const loader = async ({ params }: LoaderFunctionArgs) => {
	const { id: tournamentId } = parseParams({ params, schema: idObject });

	const tournament = await tournamentSharedCached(tournamentId);
	requireTournamentVisible({ ctx: tournament.ctx, user: getUser() });

	const teams = await tournamentTeamsFullCached({ tournamentId });

	const rosterByTeamId = new Map(
		teams.map((team) => [
			team.id,
			team.members.map((member) => ({
				userId: member.userId,
				username: member.username,
				country: member.country,
			})),
		]),
	);

	const toRow = (standings: Standing[]) => (standing: Standing) => ({
		placement: standing.placement,
		spr: Standings.calculateSPR({ standings, teamId: standing.team.id }),
		team: {
			id: standing.team.id,
			name: standing.team.name,
			seed: standing.team.seed,
			logoUrl: standing.team.logoUrl,
		},
		roster: (rosterByTeamId.get(standing.team.id) ?? []).filter((member) =>
			standing.team.memberUserIds.includes(member.userId),
		),
		matches: Standings.matchesPlayed({ tournament, teamId: standing.team.id }),
	});

	const persistedStandings = tournament.ctx.isFinalized
		? Standings.standingsFromPersistedResults({
				tournament,
				results:
					await TournamentRepository.findResultsByTournamentId(tournamentId),
			})
		: null;
	const result =
		persistedStandings ?? Standings.tournamentStandings(tournament);

	return {
		standings:
			result.type === "single"
				? {
						type: "single" as const,
						standings: result.standings.map(toRow(result.standings)),
					}
				: {
						type: "multi" as const,
						standings: result.standings.map(({ div, standings }) => ({
							div,
							standings: standings.map(toRow(standings)),
						})),
					},
	};
};
