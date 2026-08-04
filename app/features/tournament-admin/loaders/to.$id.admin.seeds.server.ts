import { type LoaderFunctionArgs, redirect } from "react-router";
import * as R from "remeda";
import { requireUser } from "~/features/auth/core/user.server";
import * as TournamentRepository from "~/features/tournament/TournamentRepository.server";
import {
	tournamentFromDBCached,
	tournamentTeamsFullCached,
} from "~/features/tournament-bracket/core/Tournament.server";
import * as UserCardRepository from "~/features/user-card/UserCardRepository.server";
import { parseParams } from "~/utils/remix.server";
import { tournamentPage } from "~/utils/urls";
import { idObject } from "~/utils/zod";

export const loader = async ({ params }: LoaderFunctionArgs) => {
	const user = requireUser();
	const { id: tournamentId } = parseParams({ params, schema: idObject });

	const tournament = await tournamentFromDBCached({ tournamentId, user });
	if (!tournament.isOrganizer(user)) {
		throw redirect(tournamentPage(tournamentId));
	}

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
