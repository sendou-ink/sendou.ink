import type { LoaderFunctionArgs } from "react-router";
import type { Tournament } from "~/features/tournament-bracket/core/Tournament";
import {
	tournamentFromParams,
	tournamentTeamsFullInSeedOrder,
} from "~/features/tournament-bracket/core/Tournament.server";
import type { SerializeFrom } from "~/utils/remix";
import { paginate } from "~/utils/remix.server";
import { tournamentTeamsSearchParams } from "../tournament-search-params";
import {
	getBracketProgressionLabel,
	seedsByStartingBracket,
} from "../tournament-utils";

export type TournamentTeamsLoaderData = SerializeFrom<typeof loader>;

/** How many rosters are rendered (and shipped) per page of the teams tab. */
const TEAMS_PAGE_SIZE = 50;

export const loader = async ({ request, params, url }: LoaderFunctionArgs) => {
	const { tournament, user } = await tournamentFromParams(params, {
		for: "view",
	});
	const { page } = tournamentTeamsSearchParams.parse(request);

	const teams = await tournamentTeamsFullInSeedOrder({ tournament, user });
	const seedInfoByTeamId = teamSeedInfo(tournament);

	const { currentPage, pagesCount } = paginate({
		url,
		page,
		pageSize: TEAMS_PAGE_SIZE,
		totalCount: teams.length,
	});

	return {
		teams: teams
			.slice((currentPage - 1) * TEAMS_PAGE_SIZE, currentPage * TEAMS_PAGE_SIZE)
			.map((team) => ({
				...team,
				seedInfo: seedInfoByTeamId.get(team.id),
			})),
		currentPage,
		pagesCount,
	};
};

function teamSeedInfo(tournament: Tournament) {
	const seedByTeamId = seedsByStartingBracket(tournament.ctx.teams);

	return new Map(
		tournament.ctx.teams.map((team) => {
			return [
				team.id,
				{
					seed: seedByTeamId.get(team.id)!,
					bracketLabel: tournament.isMultiStartingBracket
						? getBracketProgressionLabel(
								team.startingBracketIdx ?? 0,
								tournament.ctx.settings.bracketProgression,
							)
						: undefined,
				},
			] as const;
		}),
	);
}
