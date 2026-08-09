import type { ActionFunctionArgs } from "react-router";
import * as ChatSystemMessage from "~/features/chat/ChatSystemMessage.server";
import * as ShowcaseTournaments from "~/features/front-page/core/ShowcaseTournaments.server";
import { notify } from "~/features/notifications/core/notify.server";
import { resolveNotifications } from "~/features/notifications/core/resolve.server";
import { requireNotBannedByOrganization } from "~/features/tournament/tournament-utils.server";
import {
	clearTournamentDataCache,
	requireTournamentOrganizer,
	tournamentFromParams,
	tournamentTeamsFullCached,
} from "~/features/tournament-bracket/core/Tournament.server";
import { parseFormData } from "~/form/parse.server";
import { errorToastIfFalsy } from "~/utils/remix.server";
import { assertUnreachable } from "~/utils/types";
import * as TournamentLFGRepository from "../TournamentLFGRepository.server";
import { lookingSchema } from "../tournament-lfg-schemas";
import { survivingTeamId } from "../tournament-lfg-utils";
import { setPickupChatMetadata } from "../tournament-lfg-utils.server";

export const action = async ({ request, params }: ActionFunctionArgs) => {
	const { tournament, tournamentId, user } = await tournamentFromParams(
		params,
		{ for: "action" },
	);
	const result = await parseFormData({
		request,
		schema: lookingSchema,
	});

	if (!result.success) {
		return { fieldErrors: result.fieldErrors };
	}

	const data = result.data;

	const findOwnGroup = async () => {
		const groups =
			await TournamentLFGRepository.findLookingTeamsByTournamentId(
				tournamentId,
			);
		return groups.find((g) => g.members.some((m) => m.id === user.id));
	};

	const isGroupManager = (group: Awaited<ReturnType<typeof findOwnGroup>>) => {
		const member = group?.members.find((m) => m.id === user.id);
		return member?.role === "OWNER" || member?.role === "MANAGER";
	};

	const isGroupOwner = (group: Awaited<ReturnType<typeof findOwnGroup>>) => {
		const member = group?.members.find((m) => m.id === user.id);
		return member?.role === "OWNER";
	};

	switch (data._action) {
		case "JOIN_QUEUE": {
			const existingGroup = await findOwnGroup();
			if (existingGroup) return null;

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
				const canManageTeam =
					member?.role === "OWNER" || member?.role === "MANAGER";
				errorToastIfFalsy(
					canManageTeam,
					"Only team owners and managers can join the queue",
				);

				errorToastIfFalsy(
					team.memberUserIds.length < tournament.maxMembersPerTeam,
					"Team is already at max capacity",
				);
				const pickup = await TournamentLFGRepository.startLooking(team.id);
				if (pickup) {
					setPickupChatMetadata({
						team: pickup,
						tournament: {
							id: tournamentId,
							name: tournament.ctx.name,
							logoUrl: tournament.ctx.logoUrl,
							startTime: tournament.ctx.startsAt,
						},
					});
				}
			} else {
				await TournamentLFGRepository.insertPlaceholderTeam({
					tournamentId,
					userId: user.id,
					isStayAsSub: data.stayAsSub ?? false,
					lfgNote: data.note ?? undefined,
				});
			}

			break;
		}
		case "LIKE": {
			const groups =
				await TournamentLFGRepository.findLookingTeamsByTournamentId(
					tournamentId,
				);
			const ownGroup = groups.find((g) =>
				g.members.some((m) => m.id === user.id),
			);
			if (!ownGroup || !isGroupManager(ownGroup)) return null;

			const targetGroup = groups.find((g) => g.id === data.targetTeamId);
			if (!targetGroup) return null;

			await TournamentLFGRepository.insertLike({
				likerTeamId: ownGroup.id,
				targetTeamId: data.targetTeamId,
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

			break;
		}
		case "UNLIKE": {
			const ownGroup = await findOwnGroup();
			if (!ownGroup || !isGroupManager(ownGroup)) return null;

			await TournamentLFGRepository.deleteLike({
				likerTeamId: ownGroup.id,
				targetTeamId: data.targetTeamId,
			});

			break;
		}
		case "ACCEPT": {
			const groups =
				await TournamentLFGRepository.findLookingTeamsByTournamentId(
					tournamentId,
				);
			const ownGroup = groups.find((g) =>
				g.members.some((m) => m.id === user.id),
			);
			if (!ownGroup || !isGroupManager(ownGroup)) return null;

			const theirGroup = groups.find((g) => g.id === data.targetTeamId);
			if (!theirGroup) return null;

			const theirLikes = await TournamentLFGRepository.findAllLikesByTeamId(
				data.targetTeamId,
			);
			if (!theirLikes.given.some((like) => like.teamId === ownGroup.id)) {
				return null;
			}

			const surviving = survivingTeamId({
				ourGroup: {
					id: ownGroup.id,
					isPlaceholder: Boolean(ownGroup.isPlaceholder),
					teamName: null,
					teamAvatarUrl: null,
					note: null,
					members: [],
					usersRole: null,
				},
				theirGroup: {
					id: theirGroup.id,
					isPlaceholder: Boolean(theirGroup.isPlaceholder),
					teamName: null,
					teamAvatarUrl: null,
					note: null,
					members: [],
					usersRole: null,
				},
			});

			const otherGroup = surviving === ownGroup.id ? theirGroup : ownGroup;

			const mergeResult = await TournamentLFGRepository.mergeTeams({
				survivingTeamId: surviving,
				otherTeamId: otherGroup.id,
				maxGroupSize: tournament.maxMembersPerTeam,
			});

			await ShowcaseTournaments.refreshCachedTournamentCounts(tournamentId);

			if (mergeResult.removedChatCode) {
				ChatSystemMessage.removeRoom(mergeResult.removedChatCode);
			}

			if (mergeResult.survivor) {
				setPickupChatMetadata({
					team: mergeResult.survivor,
					tournament: {
						id: tournamentId,
						name: tournament.ctx.name,
						logoUrl: tournament.ctx.logoUrl,
						startTime: tournament.ctx.startsAt,
					},
				});
			}

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

			break;
		}
		case "GIVE_MANAGER": {
			const ownGroup = await findOwnGroup();
			errorToastIfFalsy(ownGroup && isGroupOwner(ownGroup), "Not owner");

			await TournamentLFGRepository.updateMemberRole({
				teamId: ownGroup!.id,
				userId: data.userId,
				role: "MANAGER",
			});

			break;
		}
		case "REMOVE_MANAGER": {
			const ownGroup = await findOwnGroup();
			errorToastIfFalsy(ownGroup && isGroupOwner(ownGroup), "Not owner");

			await TournamentLFGRepository.updateMemberRole({
				teamId: ownGroup!.id,
				userId: data.userId,
				role: "REGULAR",
			});

			break;
		}
		case "UPDATE_GROUP": {
			const ownGroup = await findOwnGroup();
			if (!ownGroup) return null;

			await TournamentLFGRepository.updateTeamNote({
				teamId: ownGroup.id,
				value: data.note ?? null,
			});

			await TournamentLFGRepository.updateOwnStayAsSub({
				teamId: ownGroup.id,
				value: data.stayAsSub ?? false,
			});

			break;
		}
		case "LEAVE_GROUP": {
			await TournamentLFGRepository.leaveLfg({
				userId: user.id,
				tournamentId,
			});

			break;
		}
		case "DELETE_GROUP": {
			requireTournamentOrganizer(
				tournament,
				user,
				"Only tournament organizers can remove other groups",
			);

			await TournamentLFGRepository.leaveLfg({
				userId: data.userId,
				tournamentId,
			});

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
				lfgNote: data.message ?? undefined,
			});

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
				user: { id: data.userId },
				message: "The user is banned from events hosted by this organization",
			});

			const targetTeam = tournament.teamMemberOfByUser({ id: data.userId });
			errorToastIfFalsy(
				!targetTeam || targetTeam.droppedOut,
				"User is already on a team",
			);

			const existingSubGroups =
				await TournamentLFGRepository.findSubGroups(tournamentId);
			errorToastIfFalsy(
				!existingSubGroups.some((g) =>
					g.members.some((m) => m.id === data.userId),
				),
				"User already has a sub post",
			);

			await TournamentLFGRepository.insertPlaceholderTeam({
				tournamentId,
				userId: data.userId,
				isStayAsSub: true,
				lfgNote: data.message ?? undefined,
			});

			break;
		}
		case "DELETE_SUB": {
			errorToastIfFalsy(
				user.id === data.userId || tournament.isOrganizer(user),
				"You can only delete your own sub post",
			);

			await TournamentLFGRepository.leaveLfg({
				userId: data.userId,
				tournamentId,
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
