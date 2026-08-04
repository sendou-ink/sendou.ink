import type { LoaderFunctionArgs } from "react-router";
import * as R from "remeda";
import { getUser } from "~/features/auth/core/user.server";
import * as TournamentRepository from "~/features/tournament/TournamentRepository.server";
import {
	requireTournamentVisible,
	tournamentFromDBCached,
	tournamentTeamsFullCached,
} from "~/features/tournament-bracket/core/Tournament.server";
import * as UserCardRepository from "~/features/user-card/UserCardRepository.server";
import { parseParams } from "~/utils/remix.server";
import { idObject } from "~/utils/zod";

export const loader = async ({ params }: LoaderFunctionArgs) => {
	const { id: tournamentId } = parseParams({ params, schema: idObject });

	const tournament = await tournamentFromDBCached({
		tournamentId,
		user: undefined,
	});
	requireTournamentVisible({ ctx: tournament.ctx, user: getUser() });

	const rosterByTeamId = new Map(
		(await tournamentTeamsFullCached({ tournamentId })).map((team) => [
			team.id,
			team,
		]),
	);
	// the tournament's own seed order, which is not the order rows come back in
	const teams = tournament.ctx.teams.flatMap((team) => {
		const withRoster = rosterByTeamId.get(team.id);
		return withRoster ? [withRoster] : [];
	});

	const userIds = R.unique(
		teams.flatMap((team) => team.members.map((member) => member.userId)),
	);

	return {
		teams,
		seedingSnapshot:
			await TournamentRepository.findSeedingSnapshotById(tournamentId),
		...(await UserCardRepository.findAllByUserIds({
			userIds,
		})),
	};
};
