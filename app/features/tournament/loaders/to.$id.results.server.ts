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

	const matchesByTeamId = Standings.matchesPlayedByTeamId(tournament);

	const toRows = (standings: Standing[]) => {
		const sprByTeamId = Standings.sprByTeamId(standings);

		return standings.map((standing) => ({
			placement: standing.placement,
			spr: sprByTeamId.get(standing.team.id) ?? 0,
			team: {
				id: standing.team.id,
				name: standing.team.name,
				seed: standing.team.seed,
				logoUrl: standing.team.logoUrl,
			},
			roster: (rosterByTeamId.get(standing.team.id) ?? []).filter((member) =>
				standing.team.memberUserIds.includes(member.userId),
			),
			matches: matchesByTeamId.get(standing.team.id) ?? [],
		}));
	};

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
						standings: toRows(result.standings),
					}
				: {
						type: "multi" as const,
						standings: result.standings.map(({ div, standings }) => ({
							div,
							standings: toRows(standings),
						})),
					},
	};
};
