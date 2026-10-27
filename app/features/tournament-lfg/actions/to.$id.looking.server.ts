import * as ChatSystemMessage from "~/features/chat/ChatSystemMessage.server";
import * as ShowcaseTournaments from "~/features/front-page/core/ShowcaseTournaments.server";
import { notify } from "~/features/notifications/core/notify.server";
import { resolveNotifications } from "~/features/notifications/core/resolve.server";
import { requireNotBannedByOrganization } from "~/features/tournament/tournament-utils.server";
import type { Tournament } from "~/features/tournament-bracket/core/Tournament";
import {
	clearTournamentDataCache,
	requireTournamentOrganizer,
	tournamentFromParams,
	tournamentTeamsFullCached,
} from "~/features/tournament-bracket/core/Tournament.server";
import * as UserRepository from "~/features/user-page/UserRepository.server";
import { defineAction } from "~/form/define-action.server";
import { requirePermission } from "~/modules/permissions/guards.server";
import { errorToastIfFalsy } from "~/utils/remix.server";
import { assertUnreachable } from "~/utils/types";
import * as TournamentLFG from "../core/TournamentLFG";
import * as TournamentLFGRepository from "../TournamentLFGRepository.server";
import { lookingSchema } from "../tournament-lfg-schemas";
import {
	tournamentLFGChannel,
	tournamentLFGGroupChannel,
} from "../tournament-lfg-utils";

export const action = defineAction(
	{ body: lookingSchema },
	async ({ params, body }) => {
		const { tournament, tournamentId, user } = await tournamentFromParams(
			params,
			{ for: "action" },
		);

		const findOwnGroup = async () => {
			const groups =
				await TournamentLFGRepository.findLookingTeamsByTournamentId(
					tournamentId,
				);
			return groups.find((g) => g.members.some((m) => m.id === user.id));
		};

		// sent once the data cache is cleared, so the pages refetching see the change
		const broadcasts: Array<{ channel: string }> = [];
		const broadcastLookingUpdate = () =>
			broadcasts.push({ channel: tournamentLFGChannel(tournamentId) });
		const revalidateGroupTopic = (groupId: number) =>
			broadcasts.push({
				channel: tournamentLFGGroupChannel({ tournamentId, groupId }),
			});

		switch (body._action) {
			case "JOIN_QUEUE": {
				const existingGroup = await findOwnGroup();
				if (existingGroup) return null;

				errorToastIfFalsy(
					tournament.registrationOpen,
					"Registration is closed",
				);
				await requireNotBannedByOrganization({ tournament, user });
				errorToastIfFalsy(
					tournament.canAddNewSubPost,
					"Cannot add sub post at this time",
				);
				const team = tournament.teamMemberOfByUser(user);

				if (team) {
					const teams = await tournamentTeamsFullCached({ tournamentId, user });
					const member = teams
						.find((t) => t.id === team.id)
						?.members.find((m) => m.userId === user.id);
					errorToastIfFalsy(
						TournamentLFG.canPutTeamInQueue(member?.role),
						"Only team owners and managers can join the queue",
					);

					errorToastIfFalsy(
						team.memberUserIds.length < tournament.maxMembersPerTeam,
						"Team is already at max capacity",
					);
					const roomsChangedUserIds =
						await TournamentLFGRepository.startLooking({
							teamId: team.id,
							chatRoomExpiresAt: TournamentLFG.pickupChatRoomExpiresAt(
								tournament.ctx.startsAt,
							),
						});
					ChatSystemMessage.notifyRoomsChanged(roomsChangedUserIds);
				} else {
					await TournamentLFGRepository.insertPlaceholderTeam({
						tournamentId,
						userId: user.id,
						isStayAsSub: body.stayAsSub ?? false,
						lfgNote: body.note ?? undefined,
					});
				}

				broadcastLookingUpdate();
				break;
			}
			case "LIKE": {
				errorToastIfFalsy(
					tournament.registrationOpen,
					"Registration is closed",
				);

				const groups =
					await TournamentLFGRepository.findLookingTeamsByTournamentId(
						tournamentId,
					);
				const ownGroup = groups.find((g) =>
					g.members.some((m) => m.id === user.id),
				);
				if (!ownGroup) return null;
				requirePermission(ownGroup, "MANAGE_INVITATIONS");

				const targetGroup = groups.find((g) => g.id === body.targetTeamId);
				if (!targetGroup) return null;

				await TournamentLFGRepository.insertLike({
					likerTeamId: ownGroup.id,
					targetTeamId: body.targetTeamId,
				});

				notify({
					userIds: targetGroup.members.map((m) => m.id),
					notification: {
						type: "TO_LIKE_RECEIVED",
						meta: {
							tournamentId,
							tournamentName: tournament.ctx.name,
							likerUsername: user.username,
						},
						pictureUrl: tournament.ctx.logoUrl,
					},
				});

				revalidateGroupTopic(ownGroup.id);
				revalidateGroupTopic(targetGroup.id);
				break;
			}
			case "UNLIKE": {
				const ownGroup = await findOwnGroup();
				if (!ownGroup) return null;
				requirePermission(ownGroup, "MANAGE_INVITATIONS");

				await TournamentLFGRepository.deleteLike({
					likerTeamId: ownGroup.id,
					targetTeamId: body.targetTeamId,
				});

				revalidateGroupTopic(ownGroup.id);
				revalidateGroupTopic(body.targetTeamId);
				break;
			}
			case "ACCEPT": {
				errorToastIfFalsy(
					tournament.registrationOpen,
					"Registration is closed",
				);

				const groups =
					await TournamentLFGRepository.findLookingTeamsByTournamentId(
						tournamentId,
					);
				const ownGroup = groups.find((g) =>
					g.members.some((m) => m.id === user.id),
				);
				if (!ownGroup) return null;
				requirePermission(ownGroup, "MANAGE_INVITATIONS");

				const theirGroup = groups.find((g) => g.id === body.targetTeamId);
				if (!theirGroup) return null;

				const theirLikes = await TournamentLFGRepository.findAllLikesByTeamId(
					body.targetTeamId,
				);
				if (!theirLikes.given.some((like) => like.teamId === ownGroup.id)) {
					return null;
				}

				const surviving = TournamentLFG.survivingTeamId({
					ourGroup: {
						id: ownGroup.id,
						isPlaceholder: Boolean(ownGroup.isPlaceholder),
					},
					theirGroup: {
						id: theirGroup.id,
						isPlaceholder: Boolean(theirGroup.isPlaceholder),
					},
				});

				const otherGroup = surviving === ownGroup.id ? theirGroup : ownGroup;

				errorToastIfFalsy(
					!tournament.teamById(otherGroup.id)?.checkIns.length,
					"A team that has checked in can't be merged into another team",
				);
				await requireMembersCanJoinTeam({
					tournament,
					members: [...ownGroup.members, ...theirGroup.members],
				});

				const roomsChangedUserIds = await TournamentLFGRepository.mergeTeams({
					survivingTeamId: surviving,
					otherTeamId: otherGroup.id,
					maxGroupSize: tournament.maxMembersPerTeam,
					requireInGameNames: Boolean(
						tournament.ctx.settings.requireInGameNames,
					),
					chatRoomExpiresAt: TournamentLFG.pickupChatRoomExpiresAt(
						tournament.ctx.startsAt,
					),
				});
				ChatSystemMessage.notifyRoomsChanged(roomsChangedUserIds);

				await ShowcaseTournaments.refreshCachedTournamentCounts(tournamentId);

				notify({
					userIds: theirGroup.members.map((m) => m.id),
					notification: {
						type: "TO_LIKE_ACCEPTED",
						meta: {
							tournamentId,
							tournamentName: tournament.ctx.name,
							accepterUsername: user.username,
						},
						pictureUrl: tournament.ctx.logoUrl,
					},
				});

				await resolveNotifications({
					userIds: ownGroup.members.map((m) => m.id),
					type: "TO_LIKE_RECEIVED",
					meta: { tournamentId },
				});

				broadcastLookingUpdate();
				break;
			}
			case "GIVE_MANAGER": {
				const ownGroup = await findOwnGroup();
				errorToastIfFalsy(ownGroup, "Not in a group");
				requirePermission(ownGroup, "MANAGE_ROLES");

				await TournamentLFGRepository.updateMemberRole({
					teamId: ownGroup.id,
					userId: body.userId,
					role: "MANAGER",
				});

				revalidateGroupTopic(ownGroup.id);
				break;
			}
			case "REMOVE_MANAGER": {
				const ownGroup = await findOwnGroup();
				errorToastIfFalsy(ownGroup, "Not in a group");
				requirePermission(ownGroup, "MANAGE_ROLES");

				await TournamentLFGRepository.updateMemberRole({
					teamId: ownGroup.id,
					userId: body.userId,
					role: "REGULAR",
				});

				revalidateGroupTopic(ownGroup.id);
				break;
			}
			case "UPDATE_GROUP": {
				const ownGroup = await findOwnGroup();
				if (!ownGroup) return null;
				requirePermission(ownGroup, "EDIT_NOTE");

				await TournamentLFGRepository.updateTeamNote({
					teamId: ownGroup.id,
					value: body.note ?? null,
				});

				broadcastLookingUpdate();
				break;
			}
			case "SET_STAY_AS_SUB": {
				const ownGroup = await findOwnGroup();
				if (!ownGroup) return null;

				await TournamentLFGRepository.updateOwnStayAsSub({
					teamId: ownGroup.id,
					value: body.stayAsSub,
				});

				break;
			}
			case "LEAVE_GROUP": {
				ChatSystemMessage.notifyRoomsChanged(
					await TournamentLFGRepository.leaveLfg({
						userId: user.id,
						tournamentId,
					}),
				);

				broadcastLookingUpdate();
				break;
			}
			case "DELETE_GROUP": {
				requireTournamentOrganizer(
					tournament,
					user,
					"Only tournament organizers can remove other groups",
				);

				ChatSystemMessage.notifyRoomsChanged(
					await TournamentLFGRepository.leaveLfg({
						userId: body.userId,
						tournamentId,
					}),
				);

				broadcastLookingUpdate();
				break;
			}
			case "ADD_SUB": {
				await requireNotBannedByOrganization({ tournament, user });
				errorToastIfFalsy(!tournament.everyBracketOver, "Tournament is over");
				errorToastIfFalsy(
					tournament.canAddNewSubPost,
					"Cannot add sub post at this time",
				);

				const team = tournament.teamMemberOfByUser(user);
				errorToastIfFalsy(!team, "Already on a team");

				const existingSubGroups =
					await TournamentLFGRepository.findSubGroups(tournamentId);
				const hasExistingSubPost = existingSubGroups.some((g) =>
					g.members.some((m) => m.id === user.id),
				);
				errorToastIfFalsy(!hasExistingSubPost, "Already have a sub post");

				await TournamentLFGRepository.insertPlaceholderTeam({
					tournamentId,
					userId: user.id,
					isStayAsSub: true,
					lfgNote: body.message ?? undefined,
				});

				broadcastLookingUpdate();
				break;
			}
			case "ADD_SUB_FOR_USER": {
				requireTournamentOrganizer(
					tournament,
					user,
					"Only tournament organizers can add subs for other users",
				);
				errorToastIfFalsy(
					tournament.canAddNewSubPostAsOrganizer,
					"Cannot add sub post at this time",
				);
				await requireNotBannedByOrganization({
					tournament,
					user: { id: body.userId },
					message: "The user is banned from events hosted by this organization",
				});

				const targetTeam = tournament.teamMemberOfByUser({ id: body.userId });
				errorToastIfFalsy(
					!targetTeam || targetTeam.droppedOut,
					"User is already on a team",
				);

				const existingSubGroups =
					await TournamentLFGRepository.findSubGroups(tournamentId);
				errorToastIfFalsy(
					!existingSubGroups.some((g) =>
						g.members.some((m) => m.id === body.userId),
					),
					"User already has a sub post",
				);

				await TournamentLFGRepository.insertPlaceholderTeam({
					tournamentId,
					userId: body.userId,
					isStayAsSub: true,
					lfgNote: body.message ?? undefined,
				});

				broadcastLookingUpdate();
				break;
			}
			case "DELETE_SUB": {
				errorToastIfFalsy(
					user.id === body.userId || tournament.isOrganizer(user),
					"You can only delete your own sub post",
				);

				ChatSystemMessage.notifyRoomsChanged(
					await TournamentLFGRepository.leaveLfg({
						userId: body.userId,
						tournamentId,
					}),
				);

				broadcastLookingUpdate();
				break;
			}
			default: {
				assertUnreachable(body);
			}
		}

		clearTournamentDataCache(tournamentId);
		ChatSystemMessage.send(broadcasts);

		return null;
	},
);

async function requireMembersCanJoinTeam({
	tournament,
	members,
}: {
	tournament: Tournament;
	members: Array<{ id: number; username: string }>;
}) {
	for (const member of members) {
		const memberUser = await UserRepository.findLeanById(member.id);
		errorToastIfFalsy(
			memberUser?.friendCode,
			`${member.username} has no friend code set`,
		);
		errorToastIfFalsy(
			!tournament.ctx.settings.requireInGameNames || memberUser.inGameName,
			`${member.username} has no in-game name set`,
		);
	}
}
