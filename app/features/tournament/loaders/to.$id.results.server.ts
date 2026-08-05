import type { LoaderFunctionArgs } from "react-router";
import * as TournamentRepository from "~/features/tournament/TournamentRepository.server";
import type { Standing } from "~/features/tournament-bracket/core/Bracket";
import {
	tournamentFromParams,
	tournamentTeamsFullCached,
} from "~/features/tournament-bracket/core/Tournament.server";
import type { SerializeFrom } from "~/utils/remix";
import * as Standings from "../core/Standings";

export type TournamentResultsLoaderData = SerializeFrom<typeof loader>;

export const loader = async ({ params }: LoaderFunctionArgs) => {
	const { tournament, tournamentId } = await tournamentFromParams(params, {
		for: "view",
	});

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
