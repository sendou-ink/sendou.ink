import type { ActionFunctionArgs } from "react-router";
import * as v from "valibot";
import { requireUser } from "~/features/auth/core/user.server";
import { userIsBanned } from "~/features/ban/core/banned.server";
import * as ChatSystemMessage from "~/features/chat/ChatSystemMessage.server";
import * as ShowcaseTournaments from "~/features/front-page/core/ShowcaseTournaments.server";
import { notify } from "~/features/notifications/core/notify.server";
import * as TournamentTeamRepository from "~/features/tournament/TournamentTeamRepository.server";
import {
	clearTournamentDataCache,
	requireTournamentOrganizer,
	tournamentFromDB,
} from "~/features/tournament-bracket/core/Tournament.server";
import * as TournamentLFGRepository from "~/features/tournament-lfg/TournamentLFGRepository.server";
import * as UserRepository from "~/features/user-page/UserRepository.server";
import {
	errorToastIfFalsy,
	parseBody,
	parseParams,
} from "~/utils/remix.server";
import { id } from "~/utils/schema";
import { wrapActionForApi } from "../api-action-wrapper.server";

const paramsSchema = v.object({
	id,
	teamId: id,
});

const bodySchema = v.object({
	userId: id,
});

export const action = async (args: ActionFunctionArgs) => {
	const { id: tournamentId, teamId } = parseParams({
		params: args.params,
		schema: paramsSchema,
	});
	const { userId } = await parseBody({
		request: args.request,
		schema: bodySchema,
	});

	return wrapActionForApi(async () => {
		const user = requireUser();
		const tournament = await tournamentFromDB(tournamentId);
		requireTournamentOrganizer(tournament, user);

		const team = tournament.teamById(teamId);
		errorToastIfFalsy(team, "Invalid team id");

		const previousTeam = tournament.teamMemberOfByUser({ id: userId });

		errorToastIfFalsy(
			!previousTeam?.id || previousTeam.id !== team.id,
			"User is already in this team",
		);

		errorToastIfFalsy(
			tournament.hasStarted || !previousTeam,
			"User is already in a team",
		);

		errorToastIfFalsy(
			!userIsBanned(userId),
			"User trying to be added currently has an active ban from sendou.ink",
		);

		const addMemberUser = await UserRepository.findLeanById(userId);
		errorToastIfFalsy(addMemberUser?.friendCode, "User has no friend code set");
		errorToastIfFalsy(
			!tournament.ctx.settings.requireInGameNames || addMemberUser?.inGameName,
			"User has no in-game name set",
		);

		const leftLfgUserIds = await TournamentLFGRepository.leaveLfg({
			userId,
			tournamentId,
		});

		// this team is not checked in & tournament started, so we can simply delete it
		const previousTeamIdToDelete =
			previousTeam &&
			previousTeam.checkIns.length === 0 &&
			tournament.hasStarted
				? previousTeam.id
				: undefined;
		const joinedUserIds = await TournamentTeamRepository.join({
			userId,
			newTeamId: team.id,
			previousTeamIdToDelete,
			isOrganizerAdded: true,
		});

		ChatSystemMessage.notifyRoomsChanged([...leftLfgUserIds, ...joinedUserIds]);

		ShowcaseTournaments.addToCached({
			tournamentId,
			type: "participant",
			userId,
		});
		await ShowcaseTournaments.refreshCachedTournamentCounts(tournamentId);

		if (!tournament.isTest && !tournament.isDraft) {
			notify({
				userIds: [userId],
				notification: {
					type: "TO_ADDED_TO_TEAM",
					pictureUrl: team.logoUrl ?? tournament.ctx.logoUrl,
					meta: {
						adderUsername: user.username,
						teamName: team.name,
						tournamentId,
						tournamentName: tournament.ctx.name,
						tournamentTeamId: team.id,
					},
				},
			});
		}

		clearTournamentDataCache(tournamentId);

		return null;
	}, args);
};
