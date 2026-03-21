import type { LoaderFunctionArgs } from "react-router";
import { getUser } from "~/features/auth/core/user.server";
import * as SQGroupRepository from "~/features/sendouq/SQGroupRepository.server";
import * as TeamRepository from "~/features/team/TeamRepository.server";
import * as SavedCalendarEventRepository from "~/features/tournament/SavedCalendarEventRepository.server";
import { findMapPoolByTeamId } from "~/features/tournament-bracket/queries/findMapPoolByTeamId.server";
import { parseParams } from "~/utils/remix.server";
import { idObject } from "~/utils/zod";
import { findOwnTournamentTeam } from "../queries/findOwnTournamentTeam.server";

export const loader = async ({ params }: LoaderFunctionArgs) => {
	const user = getUser();
	if (!user) return null;

	const { id: tournamentId } = parseParams({
		params,
		schema: idObject,
	});

	const ownTournamentTeam = findOwnTournamentTeam({
		tournamentId,
		userId: user.id,
	});
	if (!ownTournamentTeam) {
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
		mapPool: findMapPoolByTeamId(ownTournamentTeam.id),
		friendPlayers: await SQGroupRepository.friendsAndTeammates(user.id),
		teams: await TeamRepository.findAllMemberOfByUserId(user.id),
		isSaved: false,
	};
};

export type TournamentRegisterPageLoader = typeof loader;
