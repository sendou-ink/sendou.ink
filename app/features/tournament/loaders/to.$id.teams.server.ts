import type { LoaderFunctionArgs } from "react-router";
import { z } from "zod";
import { getUser } from "~/features/auth/core/user.server";
import {
	tournamentFromDBCached,
	tournamentTeamsFullCached,
} from "~/features/tournament-bracket/core/Tournament.server";
import type { SerializeFrom } from "~/utils/remix";
import { paginate, parseParams, parseSearchParams } from "~/utils/remix.server";
import { idObject } from "~/utils/zod";

export type TournamentTeamsLoaderData = SerializeFrom<typeof loader>;

/** How many rosters are rendered (and shipped) per page of the teams tab. */
const TEAMS_PAGE_SIZE = 50;

const teamsSearchParamsSchema = z.object({
	page: z.coerce.number().int().min(1).catch(1),
});

export const loader = async ({ request, params, url }: LoaderFunctionArgs) => {
	const user = getUser();
	const { id: tournamentId } = parseParams({ params, schema: idObject });
	const { page } = parseSearchParams({
		request,
		schema: teamsSearchParamsSchema,
	});

	const tournament = await tournamentFromDBCached({ tournamentId, user });
	const rosterByTeamId = new Map(
		(await tournamentTeamsFullCached({ tournamentId, user })).map((team) => [
			team.id,
			team,
		]),
	);
	// the tournament's own seed order, which is not the order rows come back in
	const teams = tournament.ctx.teams.flatMap((team) => {
		const withRoster = rosterByTeamId.get(team.id);
		return withRoster ? [withRoster] : [];
	});

	const { currentPage, pagesCount } = paginate({
		url,
		page,
		pageSize: TEAMS_PAGE_SIZE,
		totalCount: teams.length,
	});

	return {
		teams: teams.slice(
			(currentPage - 1) * TEAMS_PAGE_SIZE,
			currentPage * TEAMS_PAGE_SIZE,
		),
		currentPage,
		pagesCount,
	};
};
