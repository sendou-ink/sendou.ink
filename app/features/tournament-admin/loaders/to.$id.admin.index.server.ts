import { type LoaderFunctionArgs, redirect } from "react-router";
import { requireUser } from "~/features/auth/core/user.server";
import {
	tournamentSharedCached,
	tournamentTeamsFullCached,
} from "~/features/tournament-bracket/core/Tournament.server";
import type { SerializeFrom } from "~/utils/remix";
import { parseParams } from "~/utils/remix.server";
import { tournamentPage } from "~/utils/urls";
import { idObject } from "~/utils/zod";

export type TournamentAdminTeamsLoaderData = SerializeFrom<typeof loader>;

export const loader = async ({ params }: LoaderFunctionArgs) => {
	const user = requireUser();
	const { id: tournamentId } = parseParams({ params, schema: idObject });

	const tournament = await tournamentSharedCached(tournamentId);
	if (!tournament.isOrganizer(user)) {
		throw redirect(tournamentPage(tournamentId));
	}

	const rosterByTeamId = new Map(
		(await tournamentTeamsFullCached({ tournamentId, user })).map((team) => [
			team.id,
			team,
		]),
	);

	return {
		// the tournament's own seed order, which is not the order rows come back in
		teams: tournament.ctx.teams.flatMap((team) => {
			const withRoster = rosterByTeamId.get(team.id);
			return withRoster ? [withRoster] : [];
		}),
	};
};
