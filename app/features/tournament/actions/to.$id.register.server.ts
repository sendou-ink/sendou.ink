import type { ActionFunction } from "react-router";
import * as R from "remeda";
import * as ChatSystemMessage from "~/features/chat/ChatSystemMessage.server";
import * as ShowcaseTournaments from "~/features/front-page/core/ShowcaseTournaments.server";
import { MapPool } from "~/features/map-list-generator/core/map-pool";
import { notify } from "~/features/notifications/core/notify.server";
import { resolveNotifications } from "~/features/notifications/core/resolve.server";
import * as SQGroupRepository from "~/features/sendouq/SQGroupRepository.server";
import * as TeamRepository from "~/features/team/TeamRepository.server";
import { getMemberRoleType } from "~/features/team/team-utils";
import * as SavedCalendarEventRepository from "~/features/tournament/SavedCalendarEventRepository.server";
import * as TournamentTeamRepository from "~/features/tournament/TournamentTeamRepository.server";
import type { Tournament } from "~/features/tournament-bracket/core/Tournament";
import {
	clearTournamentDataCache,
	tournamentFromParams,
} from "~/features/tournament-bracket/core/Tournament.server";
import * as TournamentLFGRepository from "~/features/tournament-lfg/TournamentLFGRepository.server";
import * as UserRepository from "~/features/user-page/UserRepository.server";
import { parseFormDataWithImages } from "~/form/parse.server";
import { logger } from "~/utils/logger";
import { errorToastIfFalsy, successToast } from "~/utils/remix.server";
import { toDBBoolean } from "~/utils/sql";
import { assertUnreachable } from "~/utils/types";
import { registerSchema } from "../tournament-schemas.server";
import {
	isOneModeTournamentOf,
	validateCounterPickMapPool,
} from "../tournament-utils";
import {
	fulfillsSendouQParticipation,
	isBannedByOrganization,
	requireNotBannedByOrganization,
	requireSendouQParticipationIfNeeded,
} from "../tournament-utils.server";

export const action: ActionFunction = async ({ request, params }) => {
	const { tournament, tournamentId, user } = await tournamentFromParams(
		params,
		{ for: "action" },
	);
	const ownTeam = tournament.ownedTeamByUser(user);

	const result = await parseFormDataWithImages({
		request,
		schema: registerSchema({ tournament, ownTeamId: ownTeam?.id }),
	});
	if (!result.success) {
		return { fieldErrors: result.fieldErrors };
	}
	const data = result.data;

	errorToastIfFalsy(
		!tournament.hasStarted,
		"Tournament has started, cannot make edits to registration",
	);

	const ownTeamCheckedIn = Boolean(ownTeam && ownTeam.checkIns.length > 0);

	switch (data._action) {
		case "UPSERT_TEAM": {
			const linkedTeamId = data.teamId ? Number(data.teamId) : null;

			errorToastIfFalsy(
				!linkedTeamId ||
					(await TeamRepository.findAllMemberOfByUserId(user.id)).some(
						(team) => team.id === linkedTeamId,
					),
				"Team id does not match any of the teams you are in",
			);

			// linked teams source their name and logo from the sendou.ink team
			const name = (
				linkedTeamId
					? (await TeamRepository.findById(linkedTeamId))?.name
					: data.pickUpName
			)!;

			const avatarImgId = linkedTeamId ? null : data.logo;

			if (ownTeam) {
				errorToastIfFalsy(
					tournament.registrationOpen || name === ownTeam.name,
					"Can't change team name after registration has closed",
				);

				await TournamentTeamRepository.update({
					avatarImgId,
					team: {
						id: ownTeam.id,
						name,
						prefersNotToHost: toDBBoolean(data.prefersNotToHost),
						teamId: linkedTeamId,
					},
				});
			} else {
				await requireNotBannedByOrganization({
					tournament,
					user,
				});
				await requireSendouQParticipationIfNeeded({
					tournament,
					userId: user.id,
				});

				errorToastIfFalsy(!tournament.isInvitational, "Event is invite only");
				errorToastIfFalsy(
					(await UserRepository.findLeanById(user.id))?.friendCode,
					"No friend code",
				);
				errorToastIfFalsy(
					!tournament.teamMemberOfByUser(user),
					"You are already in a team that you aren't captain of",
				);
				errorToastIfFalsy(
					tournament.registrationOpen,
					"Registration is closed",
				);

				ChatSystemMessage.notifyRoomsChanged(
					await TournamentLFGRepository.leaveLfg({
						userId: user.id,
						tournamentId,
					}),
				);
				await TournamentTeamRepository.insert({
					team: {
						name,
						prefersNotToHost: toDBBoolean(data.prefersNotToHost),
						teamId: linkedTeamId,
					},
					userId: user.id,
					tournamentId,
					avatarImgId,
				});
				await SavedCalendarEventRepository.unsaveByUserId({
					userId: user.id,
					tournamentId,
				});

				ShowcaseTournaments.addToCached({
					tournamentId,
					type: "participant",
					userId: user.id,
				});
				await ShowcaseTournaments.refreshCachedTournamentCounts(tournamentId);
			}
			break;
		}
		case "DELETE_TEAM_MEMBER": {
			errorToastIfFalsy(ownTeam, "You are not registered to this tournament");
			errorToastIfFalsy(
				!tournament.isInvitational,
				"The organizer manages the roster of an invitational team",
			);
			errorToastIfFalsy(
				ownTeam.memberUserIds.includes(data.userId),
				"User is not in your team",
			);
			errorToastIfFalsy(data.userId !== user.id, "Can't kick yourself");

			// a full roster is a check-in condition, so kicking below it after checking in is not allowed
			errorToastIfFalsy(
				!ownTeamCheckedIn ||
					ownTeam.memberUserIds.length > tournament.minMembersPerTeam,
				"Can't kick a member after checking in",
			);

			await TournamentTeamRepository.leave({
				teamId: ownTeam.id,
				userId: data.userId,
			});

			ShowcaseTournaments.removeFromCached({
				tournamentId,
				type: "participant",
				userId: data.userId,
			});
			await ShowcaseTournaments.refreshCachedTournamentCounts(tournamentId);
			break;
		}
		case "LEAVE_TEAM": {
			errorToastIfFalsy(!ownTeam, "Can't leave a team as the owner");

			const teamMemberOf = tournament.teamMemberOfByUser(user);
			errorToastIfFalsy(teamMemberOf, "You are not in a team");
			errorToastIfFalsy(
				!(await TournamentTeamRepository.isOrganizerAddedMember({
					tournamentTeamId: teamMemberOf.id,
					userId: user.id,
				})),
				"You were added to the team by the organizer, contact the TO to leave the team",
			);
			errorToastIfFalsy(
				teamMemberOf.checkIns.length === 0,
				"You cannot leave after checking in",
			);
			errorToastIfFalsy(
				tournament.registrationOpen,
				"Registration has closed, contact the TO to leave the team",
			);

			await TournamentTeamRepository.leave({
				teamId: teamMemberOf.id,
				userId: user.id,
			});

			ShowcaseTournaments.removeFromCached({
				tournamentId,
				type: "participant",
				userId: user.id,
			});
			await ShowcaseTournaments.refreshCachedTournamentCounts(tournamentId);

			break;
		}
		case "UPDATE_MAP_POOL": {
			const mapPool = new MapPool(data.mapPool);
			errorToastIfFalsy(ownTeam, "You are not registered to this tournament");
			errorToastIfFalsy(
				validateCounterPickMapPool(
					mapPool,
					isOneModeTournamentOf(
						tournament.ctx.mapPickingStyle,
						tournament.ctx.toSetMapPool,
					),
					tournament.ctx.tieBreakerMapPool,
				) === "VALID",
				"Invalid map pool",
			);

			await TournamentTeamRepository.upsertCounterpickMaps({
				tournamentTeamId: ownTeam.id,
				mapPool: new MapPool(data.mapPool),
			});
			break;
		}
		case "CHECK_IN": {
			logger.info(
				`Checking in (try): owned tournament team id: ${ownTeam?.id} - user id: ${user.id} - tournament id: ${tournamentId}`,
			);

			const teamMemberOf = tournament.teamMemberOfByUser(user);
			errorToastIfFalsy(teamMemberOf, "You are not in a team");
			errorToastIfFalsy(
				teamMemberOf.checkIns.length === 0,
				"You have already checked in",
			);

			errorToastIfFalsy(
				tournament.regularCheckInIsOpen,
				"Check in is not open",
			);
			errorToastIfFalsy(
				tournament.checkInConditionsFulfilledByTeamId(teamMemberOf.id)
					.isFulfilled,
				`Can't check-in - ${tournament.checkInConditionsFulfilledByTeamId(teamMemberOf.id).reason}`,
			);

			await TournamentTeamRepository.checkIn(teamMemberOf.id);
			logger.info(
				`Checking in (success): tournament team id: ${teamMemberOf.id} - user id: ${user.id} - tournament id: ${tournamentId}`,
			);

			await resolveNotifications({
				userIds: teamMemberOf.memberUserIds,
				type: "TO_CHECK_IN_OPENED",
				meta: { tournamentId },
			});
			break;
		}
		case "ADD_PLAYER": {
			errorToastIfFalsy(
				tournament.ctx.teams.every(
					(team) => !team.memberUserIds.includes(data.userId),
				),
				"User is already in a team",
			);
			errorToastIfFalsy(ownTeam, "You are not registered to this tournament");
			errorToastIfFalsy(
				ownTeam.memberUserIds.length < tournament.maxMembersPerTeam,
				"Team is already at max capacity",
			);
			errorToastIfFalsy(
				(await SQGroupRepository.findFriendsAndTeammates(user.id)).friends.some(
					(friendPlayer) => friendPlayer.id === data.userId,
				),
				"Not a friend",
			);
			const userToAdd = await UserRepository.findLeanById(data.userId);
			errorToastIfFalsy(
				userToAdd?.friendCode,
				"User you are trying to add has no friend code set",
			);
			errorToastIfFalsy(
				!tournament.ctx.settings.requireInGameNames || userToAdd.inGameName,
				"User you are trying to add has no in-game name set",
			);
			errorToastIfFalsy(tournament.registrationOpen, "Registration is closed");

			await requireNotBannedByOrganization({
				tournament,
				user: { id: data.userId },
				message: "The user is banned from events hosted by this organization",
			});
			await requireSendouQParticipationIfNeeded({
				tournament,
				userId: data.userId,
			});

			await addPlayerToOwnTeam({
				tournament,
				tournamentId,
				ownTeam,
				adder: user,
				userId: data.userId,
			});

			await ShowcaseTournaments.refreshCachedTournamentCounts(tournamentId);

			break;
		}
		case "ADD_TEAM_PLAYERS": {
			errorToastIfFalsy(ownTeam, "You are not registered to this tournament");
			errorToastIfFalsy(tournament.registrationOpen, "Registration is closed");

			const friendPlayers = await SQGroupRepository.findFriendsAndTeammates(
				user.id,
			);
			errorToastIfFalsy(
				friendPlayers.teams.some((team) => team.id === data.teamId),
				"Team id does not match any of the teams you are in",
			);

			const candidates = friendPlayers.friends.filter(
				(friendPlayer) =>
					friendPlayer.teamId === data.teamId &&
					getMemberRoleType(friendPlayer) !== "OTHER" &&
					tournament.ctx.teams.every(
						(team) => !team.memberUserIds.includes(friendPlayer.id),
					) &&
					(!tournament.ctx.settings.requireInGameNames ||
						friendPlayer.inGameName),
			);
			errorToastIfFalsy(candidates.length > 0, "No players to add");

			const spotsLeft =
				tournament.maxMembersPerTeam - ownTeam.memberUserIds.length;
			errorToastIfFalsy(spotsLeft > 0, "Team is already at max capacity");

			let addedCount = 0;
			const skippedReasons: Array<IneligibleReason> = [];
			for (const candidate of candidates) {
				if (addedCount >= spotsLeft) break;

				const reason = await ineligibleReason({
					tournament,
					userId: candidate.id,
				});
				if (reason) {
					skippedReasons.push(reason);
					continue;
				}

				await addPlayerToOwnTeam({
					tournament,
					tournamentId,
					ownTeam,
					adder: user,
					userId: candidate.id,
				});
				addedCount++;
			}

			errorToastIfFalsy(
				addedCount > 0,
				`No players could be added. ${skippedSummary(skippedReasons)}`.trim(),
			);

			await ShowcaseTournaments.refreshCachedTournamentCounts(tournamentId);

			if (skippedReasons.length > 0) {
				clearTournamentDataCache(tournamentId);

				return successToast(
					`Added ${addedCount} player(s). ${skippedSummary(skippedReasons)}`,
				);
			}

			break;
		}
		case "UNREGISTER": {
			errorToastIfFalsy(ownTeam, "You are not registered to this tournament");
			errorToastIfFalsy(
				!tournament.isInvitational,
				"The organizer manages the roster of an invitational team",
			);
			errorToastIfFalsy(
				!ownTeamCheckedIn,
				"You cannot unregister after checking in",
			);
			errorToastIfFalsy(
				!tournament.isLeague || tournament.registrationOpen,
				"Unregistering from leagues is not possible after registration has closed",
			);

			ChatSystemMessage.notifyRoomsChanged(
				await TournamentTeamRepository.deleteById(ownTeam.id),
			);

			for (const userId of ownTeam.memberUserIds) {
				ShowcaseTournaments.removeFromCached({
					tournamentId,
					type: "participant",
					userId,
				});
			}
			await ShowcaseTournaments.refreshCachedTournamentCounts(tournamentId);

			break;
		}
		default: {
			assertUnreachable(data);
		}
	}

	clearTournamentDataCache(tournamentId);

	return null;
};

type IneligibleReason =
	| "no friend code"
	| "banned by the organization"
	| "not enough SendouQ participation";

/** Why the "add all" bulk add has to pass a candidate over, or `null` if they can be added. */
async function ineligibleReason({
	tournament,
	userId,
}: {
	tournament: Tournament;
	userId: number;
}): Promise<IneligibleReason | null> {
	if (!(await UserRepository.findLeanById(userId))?.friendCode) {
		return "no friend code";
	}
	if (await isBannedByOrganization({ tournament, userId })) {
		return "banned by the organization";
	}
	if (!(await fulfillsSendouQParticipation({ tournament, userId }))) {
		return "not enough SendouQ participation";
	}

	return null;
}

// names are left out on purpose: the message travels in a redirect's query string
function skippedSummary(reasons: Array<IneligibleReason>) {
	if (reasons.length === 0) return "";

	const counts = R.countBy(reasons, (reason) => reason);

	return `Skipped ${reasons.length} player(s): ${Object.entries(counts)
		.map(([reason, count]) => `${reason} (${count})`)
		.join(", ")}`;
}

async function addPlayerToOwnTeam({
	tournament,
	tournamentId,
	ownTeam,
	adder,
	userId,
}: {
	tournament: Tournament;
	tournamentId: number;
	ownTeam: { id: number; name: string };
	adder: { username: string };
	userId: number;
}) {
	ChatSystemMessage.notifyRoomsChanged([
		...(await TournamentLFGRepository.leaveLfg({
			userId,
			tournamentId,
		})),
		...(await TournamentTeamRepository.join({
			userId,
			newTeamId: ownTeam.id,
		})),
	]);

	await SavedCalendarEventRepository.unsaveByUserId({
		userId,
		tournamentId,
	});

	ShowcaseTournaments.addToCached({
		tournamentId,
		type: "participant",
		userId,
	});

	if (!tournament.isTest && !tournament.isDraft) {
		notify({
			userIds: [userId],
			notification: {
				type: "TO_ADDED_TO_TEAM",
				meta: {
					adderUsername: adder.username,
					tournamentId,
					teamName: ownTeam.name,
					tournamentName: tournament.ctx.name,
					tournamentTeamId: ownTeam.id,
				},
				pictureUrl: tournament.ctx.logoUrl,
			},
		});
	}
}
