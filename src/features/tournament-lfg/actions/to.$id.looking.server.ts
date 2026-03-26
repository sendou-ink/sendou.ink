import type { ActionFunctionArgs } from "react-router";
import { requireUser } from "~/features/auth/core/user.server";
import { notify } from "~/features/notifications/core/notify.server";
import { requireNotBannedByOrganization } from "~/features/tournament/tournament-utils.server";
import {
	clearTournamentDataCache,
	tournamentFromDBCached,
} from "~/features/tournament-bracket/core/Tournament.server";
import {
	errorToastIfFalsy,
	parseParams,
	parseRequestPayload,
} from "~/utils/remix.server";
import { assertUnreachable } from "~/utils/types";
import { idObject } from "~/utils/zod";
import * as TournamentLFGRepository from "../TournamentLFGRepository.server";
import { lookingSchema } from "../tournament-lfg-schemas";
import { survivingTeamId } from "../tournament-lfg-utils";

export const action = async ({ request, params }: ActionFunctionArgs) => {
	const user = requireUser();
	const { id: tournamentId } = parseParams({ params, schema: idObject });
	const data = await parseRequestPayload({
		request,
		schema: lookingSchema,
	});

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

			const tournament = await tournamentFromDBCached({
				tournamentId,
				user,
			});
			await requireNotBannedByOrganization({ tournament, user });
			errorToastIfFalsy(
				tournament.canAddNewSubPost,
				"Cannot add sub post at this time",
			);
			const team = tournament.teamMemberOfByUser(user);

			if (team) {
				const member = team.members.find((m) => m.userId === user.id);
				const canManageTeam = member?.isOwner || member?.role === "MANAGER";
				errorToastIfFalsy(
					canManageTeam,
					"Only team owners and managers can join the queue",
				);

				errorToastIfFalsy(
					team.members.length < tournament.maxMembersPerTeam,
					"Team is already at max capacity",
				);
				await TournamentLFGRepository.startLooking(team.id);
			} else {
				await TournamentLFGRepository.createPlaceholderTeam({
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

			await TournamentLFGRepository.addLike({
				likerTeamId: ownGroup.id,
				targetTeamId: data.targetTeamId,
			});

			const tournament = await tournamentFromDBCached({
				tournamentId,
				user,
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

			const theirLikes = await TournamentLFGRepository.allLikesByTeamId(
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

			const tournament = await tournamentFromDBCached({
				tournamentId,
				user,
			});

			await TournamentLFGRepository.mergeTeams({
				survivingTeamId: surviving,
				otherTeamId: otherGroup.id,
				maxGroupSize: tournament.maxMembersPerTeam,
			});

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

			await TournamentLFGRepository.updateStayAsSub({
				teamId: ownGroup.id,
				userId: user.id,
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
		case "ADD_SUB": {
			const tournament = await tournamentFromDBCached({
				tournamentId,
				user,
			});
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

			await TournamentLFGRepository.createPlaceholderTeam({
				tournamentId,
				userId: user.id,
				isStayAsSub: true,
				lfgNote: data.message ?? undefined,
			});

			break;
		}
		case "DELETE_SUB": {
			const tournament = await tournamentFromDBCached({
				tournamentId,
				user,
			});
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
