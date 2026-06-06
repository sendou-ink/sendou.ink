import type { ActionFunction } from "react-router";
import * as R from "remeda";
import { requireUser } from "~/features/auth/core/user.server";
import { userIsBanned } from "~/features/ban/core/banned.server";
import * as ChatSystemMessage from "~/features/chat/ChatSystemMessage.server";
import * as ShowcaseTournaments from "~/features/front-page/core/ShowcaseTournaments.server";
import { notify } from "~/features/notifications/core/notify.server";
import * as TournamentTeamRepository from "~/features/tournament/TournamentTeamRepository.server";
import { endDroppedTeamMatches } from "~/features/tournament/tournament-utils.server";
import { getServerTournamentManager } from "~/features/tournament-bracket/core/brackets-manager/manager.server";
import {
	clearTournamentDataCache,
	tournamentFromDB,
} from "~/features/tournament-bracket/core/Tournament.server";
import { tournamentWebsocketRoom } from "~/features/tournament-bracket/tournament-bracket-utils";
import * as TournamentLFGRepository from "~/features/tournament-lfg/TournamentLFGRepository.server";
import { tournamentMatchWebsocketRoom } from "~/features/tournament-match/tournament-match-utils";
import * as UserRepository from "~/features/user-page/UserRepository.server";
import invariant from "~/utils/invariant";
import { logger } from "~/utils/logger";
import {
	badRequestIfFalsy,
	errorToastIfFalsy,
	parseParams,
	parseRequestPayload,
} from "~/utils/remix.server";
import { assertUnreachable } from "~/utils/types";
import { idObject } from "../../../utils/zod";
import { adminTeamsActionSchema } from "../tournament-admin-schemas.server";

export const action: ActionFunction = async ({ request, params }) => {
	const user = requireUser();
	const data = await parseRequestPayload({
		request,
		schema: adminTeamsActionSchema,
	});

	const { id: tournamentId } = parseParams({
		params,
		schema: idObject,
	});
	const tournament = await tournamentFromDB({ tournamentId, user });

	const validateIsTournamentOrganizer = () =>
		errorToastIfFalsy(tournament.isOrganizer(user), "Unauthorized");

	switch (data._action) {
		case "CHECK_IN": {
			validateIsTournamentOrganizer();
			const team = tournament.teamById(data.teamId);
			errorToastIfFalsy(team, "Invalid team id");
			errorToastIfFalsy(
				data.bracketIdx !== 0 ||
					tournament.checkInConditionsFulfilledByTeamId(team.id).isFulfilled,
				`Can't check-in - ${tournament.checkInConditionsFulfilledByTeamId(team.id).reason}`,
			);
			errorToastIfFalsy(
				team.checkIns.length > 0 || data.bracketIdx === 0,
				"Can't check-in to follow up bracket if not checked in for the event itself",
			);

			const bracket = tournament.bracketByIdx(data.bracketIdx);
			invariant(bracket, "Invalid bracket idx");
			errorToastIfFalsy(bracket.preview, "Bracket has been started");

			await TournamentTeamRepository.checkIn(data.teamId, {
				// no sources = regular check in
				bracketIdx: bracket.sources ? data.bracketIdx : undefined,
			});

			break;
		}
		case "CHECK_OUT": {
			validateIsTournamentOrganizer();
			const team = tournament.teamById(data.teamId);
			errorToastIfFalsy(team, "Invalid team id");
			errorToastIfFalsy(
				data.bracketIdx !== 0 || !tournament.hasStarted,
				"Tournament has started",
			);

			const bracket = tournament.bracketByIdx(data.bracketIdx);
			invariant(bracket, "Invalid bracket idx");
			errorToastIfFalsy(bracket.preview, "Bracket has been started");

			await TournamentTeamRepository.checkOut({
				tournamentTeamId: data.teamId,
				// no sources = regular check in
				bracketIdx: !bracket.sources ? null : data.bracketIdx,
			});
			logger.info(
				`Checked out: tournament team id: ${data.teamId} - user id: ${user.id} - tournament id: ${tournamentId} - bracket idx: ${data.bracketIdx}`,
			);

			break;
		}
		// xxx: only kept for the public API - migrate it to UPSERT_REGISTRATION and remove
		case "REMOVE_MEMBER": {
			validateIsTournamentOrganizer();
			const team = tournament.teamById(data.teamId);
			errorToastIfFalsy(team, "Invalid team id");
			errorToastIfFalsy(
				team.checkIns.length === 0 ||
					team.members.length > tournament.minMembersPerTeam,
				"Can't remove last member from checked in team",
			);
			errorToastIfFalsy(
				team.members.find((m) => m.userId === data.memberId)?.role !== "OWNER",
				"Cannot remove team owner",
			);
			errorToastIfFalsy(
				!tournament.hasStarted ||
					!tournament
						.participatedPlayersByTeamId(data.teamId)
						.some((p) => p.userId === data.memberId),
				"Cannot remove player that has participated in the tournament",
			);

			if (team.activeRosterUserIds?.includes(data.memberId)) {
				await TournamentTeamRepository.setActiveRoster({
					teamId: team.id,
					activeRosterUserIds: null,
				});
			}

			await TournamentTeamRepository.leave({
				userId: data.memberId,
				teamId: team.id,
			});

			ShowcaseTournaments.removeFromCached({
				tournamentId,
				type: "participant",
				userId: data.memberId,
			});

			break;
		}
		// xxx: only kept for the public API - migrate it to UPSERT_REGISTRATION and remove
		case "ADD_MEMBER": {
			validateIsTournamentOrganizer();
			const team = tournament.teamById(data.teamId);
			errorToastIfFalsy(team, "Invalid team id");

			const previousTeam = tournament.teamMemberOfByUser({ id: data.userId });

			errorToastIfFalsy(
				!previousTeam?.id || previousTeam.id !== team.id,
				"User is already in this team",
			);

			errorToastIfFalsy(
				tournament.hasStarted || !previousTeam,
				"User is already in a team",
			);

			errorToastIfFalsy(
				!userIsBanned(data.userId),
				"User trying to be added currently has an active ban from sendou.ink",
			);

			const addMemberUser = await UserRepository.findLeanById(data.userId);
			errorToastIfFalsy(
				addMemberUser?.friendCode,
				"User has no friend code set",
			);
			errorToastIfFalsy(
				!tournament.ctx.settings.requireInGameNames ||
					addMemberUser?.inGameName,
				"User has no in-game name set",
			);

			await TournamentLFGRepository.leaveLfg({
				userId: data.userId,
				tournamentId,
			});
			await TournamentTeamRepository.join({
				userId: data.userId,
				newTeamId: team.id,
				previousTeamId: previousTeam?.id,
				// this team is not checked in & tournament started, so we can simply delete it
				whatToDoWithPreviousTeam:
					previousTeam &&
					previousTeam.checkIns.length === 0 &&
					tournament.hasStarted
						? "DELETE"
						: undefined,
			});

			ShowcaseTournaments.addToCached({
				tournamentId,
				type: "participant",
				userId: data.userId,
			});

			if (!tournament.isTest && !tournament.isDraft) {
				notify({
					userIds: [data.userId],
					notification: {
						type: "TO_ADDED_TO_TEAM",
						pictureUrl:
							tournament.tournamentTeamLogoSrc(team) ?? tournament.ctx.logoUrl,
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

			break;
		}
		case "DELETE_TEAM": {
			validateIsTournamentOrganizer();
			const team = tournament.teamById(data.teamId);
			errorToastIfFalsy(team, "Invalid team id");
			errorToastIfFalsy(!tournament.hasStarted, "Tournament has started");

			await TournamentTeamRepository.del(team.id);

			for (const member of team.members) {
				ShowcaseTournaments.removeFromCached({
					tournamentId,
					type: "participant",
					userId: member.userId,
				});

				ShowcaseTournaments.updateCachedTournamentTeamCount({
					tournamentId,
					newTeamCount: tournament.ctx.teams.length - 1,
				});
			}

			break;
		}
		case "DROP_TEAM_OUT": {
			validateIsTournamentOrganizer();
			errorToastIfFalsy(tournament.teamById(data.teamId), "Invalid team id");

			const endedMatchIds = await dropTeamOut({
				tournament,
				manager: getServerTournamentManager(),
				teamId: data.teamId,
			});

			sendDroppedMatchChatMessages({
				tournamentId: tournament.ctx.id,
				endedMatchIds,
				authorUserId: user.id,
			});

			break;
		}
		case "UNDO_DROP_TEAM_OUT": {
			validateIsTournamentOrganizer();

			await TournamentTeamRepository.undoDropOut(data.teamId);

			break;
		}
		// xxx: only kept for the public API - migrate it to UPSERT_REGISTRATION and remove
		case "UPDATE_IN_GAME_NAME": {
			validateIsTournamentOrganizer();

			const teamMemberOf = badRequestIfFalsy(
				tournament.teamMemberOfByUser({ id: data.memberId }),
			);

			await TournamentTeamRepository.updateMemberInGameName({
				userId: data.memberId,
				inGameName: `${data.inGameNameText}#${data.inGameNameDiscriminator}`,
				tournamentTeamId: teamMemberOf.id,
			});

			break;
		}
		default: {
			assertUnreachable(data);
		}
	}

	clearTournamentDataCache(tournamentId);

	return null;
};

/**
 * Drops a single team out: assigns a random active roster for teams with subs,
 * ends their in-progress matches and marks the team dropped out. Returns the ids
 * of matches that were ended so the caller can broadcast a single batch of chat
 * messages.
 */
async function dropTeamOut({
	tournament,
	manager,
	teamId,
}: {
	tournament: Awaited<ReturnType<typeof tournamentFromDB>>;
	manager: ReturnType<typeof getServerTournamentManager>;
	teamId: number;
}) {
	const droppingTeam = tournament.teamById(teamId);
	invariant(droppingTeam, "Invalid team id");

	// Set active roster only for teams with subs (can't infer which players played)
	// Teams without subs have their roster trivially inferred in summarizer
	const hasSubs = droppingTeam.members.length > tournament.minMembersPerTeam;
	if (hasSubs && !droppingTeam.activeRosterUserIds) {
		const randomRoster = R.sample(
			droppingTeam.members.map((m) => m.userId),
			tournament.minMembersPerTeam,
		);
		await TournamentTeamRepository.setActiveRoster({
			teamId,
			activeRosterUserIds: randomRoster,
		});
	}

	const endedMatchIds = endDroppedTeamMatches({
		tournament,
		manager,
		droppedTeamId: teamId,
	});

	await TournamentTeamRepository.dropOut({
		tournamentTeamId: teamId,
		previewBracketIdxs: tournament.brackets.flatMap((b, idx) =>
			b.preview ? idx : [],
		),
	});

	return endedMatchIds;
}

function sendDroppedMatchChatMessages({
	tournamentId,
	endedMatchIds,
	authorUserId,
}: {
	tournamentId: number;
	endedMatchIds: number[];
	authorUserId: number;
}) {
	if (endedMatchIds.length === 0) return;

	ChatSystemMessage.send([
		...endedMatchIds.map((matchId) => ({
			room: tournamentMatchWebsocketRoom(matchId),
			type: "TOURNAMENT_MATCH_UPDATED" as const,
			revalidateOnly: true as const,
			authorUserId,
		})),
		{
			room: tournamentWebsocketRoom(tournamentId),
			type: "TOURNAMENT_UPDATED" as const,
			revalidateOnly: true as const,
			authorUserId,
		},
	]);
}
