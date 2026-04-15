import type { LoaderFunctionArgs } from "react-router";
import { getUser } from "~/features/auth/core/user.server";
import * as SQGroupRepository from "~/features/sendouq/SQGroupRepository.server";
import * as TeamRepository from "~/features/team/TeamRepository.server";
import * as SavedCalendarEventRepository from "~/features/tournament/SavedCalendarEventRepository.server";
import { tournamentFromDBCached } from "~/features/tournament-bracket/core/Tournament.server";
import { findMapPoolByTeamId } from "~/features/tournament-bracket/queries/findMapPoolByTeamId.server";
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
	const ownTeam = tournament.ownedTeamByUser(user);

	if (!ownTeam) {
		return {
			mapPool: null,
			friendPlayers: null,
			teams: await TeamRepository.findAllMemberOfByUserId(user.id),
			isSaved: await SavedCalendarEventRepository.isSaved({
				userId: user.id,
				tournamentId,
			}),
		};
	}

	return {
		mapPool: findMapPoolByTeamId(ownTeam.id),
		friendPlayers: await SQGroupRepository.friendsAndTeammates(user.id),
		teams: await TeamRepository.findAllMemberOfByUserId(user.id),
		isSaved: false,
	};
};

export type TournamentRegisterPageLoader = typeof loader;
