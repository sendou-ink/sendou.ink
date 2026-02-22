import type { ActionFunctionArgs } from "react-router";
import { db } from "~/db/sql";
import { requireUser } from "~/features/auth/core/user.server";
import {
	errorToastIfFalsy,
	parseParams,
	parseRequestPayload,
} from "~/utils/remix.server";
import { assertUnreachable } from "~/utils/types";
import { idObject } from "~/utils/zod";
import * as TournamentLFGRepository from "../TournamentLFGRepository.server";
import { lookingSchema } from "../tournament-lfg-schemas.server";
import { survivingGroupId } from "../tournament-lfg-utils";

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
			await TournamentLFGRepository.findGroupsByTournamentId(tournamentId);
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
			// xxx: handle already in a team
			const existingGroup = await findOwnGroup();
			if (existingGroup) return null;

			await TournamentLFGRepository.createGroup({
				tournamentId,
				userId: user.id,
				isStayAsSub: data.stayAsSub ?? false,
			});

			break;
		}
		case "LIKE": {
			const ownGroup = await findOwnGroup();
			if (!ownGroup || !isGroupManager(ownGroup)) return null;

			await TournamentLFGRepository.addLike({
				likerGroupId: ownGroup.id,
				targetGroupId: data.targetGroupId,
			});

			break;
		}
		case "UNLIKE": {
			const ownGroup = await findOwnGroup();
			if (!ownGroup || !isGroupManager(ownGroup)) return null;

			await TournamentLFGRepository.deleteLike({
				likerGroupId: ownGroup.id,
				targetGroupId: data.targetGroupId,
			});

			break;
		}
		case "ACCEPT": {
			const groups =
				await TournamentLFGRepository.findGroupsByTournamentId(tournamentId);
			const ownGroup = groups.find((g) =>
				g.members.some((m) => m.id === user.id),
			);
			if (!ownGroup || !isGroupManager(ownGroup)) return null;

			const theirGroup = groups.find((g) => g.id === data.targetGroupId);
			if (!theirGroup) return null;

			const theirLikes = await TournamentLFGRepository.allLikesByGroupId(
				data.targetGroupId,
			);
			if (!theirLikes.given.some((like) => like.groupId === ownGroup.id)) {
				return null;
			}

			const surviving = survivingGroupId({
				ourGroup: {
					id: ownGroup.id,
					tournamentTeamId: ownGroup.tournamentTeamId,
					teamName: null,
					teamAvatarUrl: null,
					members: [],
					usersRole: null,
				},
				theirGroup: {
					id: theirGroup.id,
					tournamentTeamId: theirGroup.tournamentTeamId,
					teamName: null,
					teamAvatarUrl: null,
					members: [],
					usersRole: null,
				},
			});

			const survivingGroup = surviving === ownGroup.id ? ownGroup : theirGroup;
			const otherGroup = surviving === ownGroup.id ? theirGroup : ownGroup;

			if (!survivingGroup.tournamentTeamId) {
				const ownerMember = survivingGroup.members.find(
					(m) => m.role === "OWNER",
				);
				// xxx: lets autogenerate some other kind of name
				const teamName = `${ownerMember?.username ?? "Team"}'s Team`;

				// xxx: why do we have db code outside of repositories
				const createdTeam = await db
					.insertInto("TournamentTeam")
					.values({
						tournamentId,
						name: teamName,
						inviteCode: "",
					})
					.returning("id")
					.executeTakeFirstOrThrow();

				await db
					.updateTable("TournamentLFGGroup")
					.set({ tournamentTeamId: createdTeam.id })
					.where("id", "=", survivingGroup.id)
					.execute();
			}

			const tournamentSettings = await db
				.selectFrom("Tournament")
				.select("settings")
				.where("id", "=", tournamentId)
				.executeTakeFirstOrThrow();

			const settings = tournamentSettings.settings;
			const minMembers = settings.minMembersPerTeam ?? 4;
			const maxGroupSize =
				minMembers !== 4 ? minMembers : (settings.maxMembersPerTeam ?? 6);

			await TournamentLFGRepository.morphGroups({
				survivingGroupId: surviving,
				otherGroupId: otherGroup.id,
				maxGroupSize,
			});

			break;
		}
		case "GIVE_MANAGER": {
			const ownGroup = await findOwnGroup();
			errorToastIfFalsy(ownGroup && isGroupOwner(ownGroup), "Not owner");

			await TournamentLFGRepository.updateMemberRole({
				groupId: ownGroup!.id,
				userId: data.userId,
				role: "MANAGER",
			});

			break;
		}
		case "REMOVE_MANAGER": {
			const ownGroup = await findOwnGroup();
			errorToastIfFalsy(ownGroup && isGroupOwner(ownGroup), "Not owner");

			await TournamentLFGRepository.updateMemberRole({
				groupId: ownGroup!.id,
				userId: data.userId,
				role: "REGULAR",
			});

			break;
		}
		case "UPDATE_NOTE": {
			const ownGroup = await findOwnGroup();
			if (!ownGroup) return null;

			await TournamentLFGRepository.updateMemberNote({
				groupId: ownGroup.id,
				userId: user.id,
				value: data.value,
			});

			break;
		}
		case "UPDATE_STAY_AS_SUB": {
			const ownGroup = await findOwnGroup();
			if (!ownGroup) return null;

			await TournamentLFGRepository.updateStayAsSub({
				groupId: ownGroup.id,
				userId: user.id,
				value: data.value,
			});

			break;
		}
		case "LEAVE_GROUP": {
			await TournamentLFGRepository.leaveGroup({
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
