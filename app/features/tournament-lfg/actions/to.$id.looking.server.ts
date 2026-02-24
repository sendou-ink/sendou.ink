import type { ActionFunctionArgs } from "react-router";
import { requireUser } from "~/features/auth/core/user.server";
import { tournamentFromDBCached } from "~/features/tournament-bracket/core/Tournament.server";
import {
	errorToastIfFalsy,
	parseParams,
	parseRequestPayload,
} from "~/utils/remix.server";
import { assertUnreachable } from "~/utils/types";
import { idObject } from "~/utils/zod";
import * as TournamentLFGRepository from "../TournamentLFGRepository.server";
import { lookingSchema } from "../tournament-lfg-schemas.server";
import { survivingTeamId } from "../tournament-lfg-utils";

// xxx: prevent actions in certain cases? like when tournament has started
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
			const team = tournament.teamMemberOfByUser(user);

			if (team) {
				await TournamentLFGRepository.startLooking(team.id);
			} else {
				await TournamentLFGRepository.createPlaceholderTeam({
					tournamentId,
					userId: user.id,
					isStayAsSub: data.stayAsSub ?? false,
				});
			}

			break;
		}
		case "LIKE": {
			const ownGroup = await findOwnGroup();
			if (!ownGroup || !isGroupManager(ownGroup)) return null;

			await TournamentLFGRepository.addLike({
				likerTeamId: ownGroup.id,
				targetTeamId: data.targetTeamId,
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
		case "UPDATE_NOTE": {
			const ownGroup = await findOwnGroup();
			if (!ownGroup) return null;

			await TournamentLFGRepository.updateTeamNote({
				teamId: ownGroup.id,
				value: data.value,
			});

			break;
		}
		case "UPDATE_STAY_AS_SUB": {
			const ownGroup = await findOwnGroup();
			if (!ownGroup) return null;

			await TournamentLFGRepository.updateStayAsSub({
				teamId: ownGroup.id,
				userId: user.id,
				value: data.value,
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
		default: {
			assertUnreachable(data);
		}
	}

	return null;
};
