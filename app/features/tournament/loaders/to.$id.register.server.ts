import type { LoaderFunctionArgs } from "react-router";
import { getUser } from "~/features/auth/core/user.server";
import * as SQGroupRepository from "~/features/sendouq/SQGroupRepository.server";
import * as TeamRepository from "~/features/team/TeamRepository.server";
import * as SavedCalendarEventRepository from "~/features/tournament/SavedCalendarEventRepository.server";
import {
	requireTournamentVisible,
	tournamentFromDBCached,
	tournamentTeamsFullCached,
} from "~/features/tournament-bracket/core/Tournament.server";
import { parseParams } from "~/utils/remix.server";
import { idObject } from "~/utils/zod";

export const loader = async ({ params }: LoaderFunctionArgs) => {
	const user = getUser();
	if (!user) return null;

	const { id: tournamentId } = parseParams({
		params,
		schema: idObject,
	});

	const tournament = await tournamentFromDBCached({ tournamentId, user });
	requireTournamentVisible({ ctx: tournament.ctx, user });

	const teamMemberOf = tournament.teamMemberOfByUser(user);

	if (!teamMemberOf) {
		return {
			ownTeam: null,
			mapPool: null,
			friendPlayers: null,
			teams: await TeamRepository.findAllMemberOfByUserId(user.id),
			isSaved: await SavedCalendarEventRepository.isSaved({
				userId: user.id,
				tournamentId,
			}),
		};
	}

	const ownTeam =
		(await tournamentTeamsFullCached({ tournamentId, user })).find(
			(team) => team.id === teamMemberOf.id,
		) ?? null;

	return {
		ownTeam,
		mapPool: ownTeam?.mapPool ?? null,
		friendPlayers: await SQGroupRepository.findFriendsAndTeammates(user.id),
		teams: await TeamRepository.findAllMemberOfByUserId(user.id),
		isSaved: false,
	};
};

export type TournamentRegisterPageLoader = typeof loader;
