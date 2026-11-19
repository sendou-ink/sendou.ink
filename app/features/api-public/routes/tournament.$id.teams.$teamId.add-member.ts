import * as v from "valibot";
import { requireUser } from "~/features/auth/core/user.server";
import * as ChatSystemMessage from "~/features/chat/ChatSystemMessage.server";
import * as TeamEligibility from "~/features/tournament/core/TeamEligibility.server";
import * as TeamJoin from "~/features/tournament/core/TeamJoin.server";
import * as TournamentTeamRepository from "~/features/tournament/TournamentTeamRepository.server";
import {
	clearTournamentDataCache,
	requireTournamentOrganizer,
	tournamentFromDB,
} from "~/features/tournament-bracket/core/Tournament.server";
import {
	tournamentChannel,
	tournamentTeamChannel,
} from "~/features/tournament-bracket/tournament-bracket-utils";
import { tournamentLFGChannel } from "~/features/tournament-lfg/tournament-lfg-utils";
import { defineAction } from "~/form/define-action.server";
import { errorToastIfFalsy } from "~/utils/remix.server";
import { id } from "~/utils/schema";
import { wrapActionForApi } from "../api-action-wrapper.server";

const paramsSchema = v.object({
	id,
	teamId: id,
});

const bodySchema = v.object({
	userId: id,
});

export const action = defineAction(
	{ params: paramsSchema, body: bodySchema, onInvalidBody: "badRequest" },
	async ({ params: { id: tournamentId, teamId }, body: { userId } }) =>
		wrapActionForApi(async () => {
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

			await TeamEligibility.requireEligible({
				tournament,
				userId,
				username: "User",
				skip: ["ORG_BANNED"],
			});

			const leftLfgUserIds = await TeamJoin.beforeJoin({
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
				allowOtherTeamMembership: tournament.hasStarted,
			});

			ChatSystemMessage.notifyRoomsChanged([
				...leftLfgUserIds,
				...(joinedUserIds ?? []),
			]);
			errorToastIfFalsy(joinedUserIds, "User is already in a team");

			await TeamJoin.afterJoined({
				tournament,
				userIds: [userId],
				addedBy: { username: user.username, team },
			});

			clearTournamentDataCache(tournamentId);

			ChatSystemMessage.send([
				{ channel: tournamentLFGChannel(tournamentId) },
				{ channel: tournamentChannel(tournamentId) },
				{ channel: tournamentTeamChannel({ tournamentId, teamId: team.id }) },
			]);

			return null;
		}),
);
