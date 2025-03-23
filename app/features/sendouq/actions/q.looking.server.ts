import type { ActionFunction } from "@remix-run/node";
import { redirect } from "@remix-run/node";
import { requireUser } from "~/features/auth/core/user.server";
import * as ChatSystemMessage from "~/features/chat/ChatSystemMessage.server";
import { notify } from "~/features/notifications/core/notify.server";
import {
	createMatchMemento,
	matchMapList,
} from "~/features/sendouq-match/core/match.server";
import * as QRepository from "~/features/sendouq/QRepository.server";
import invariant from "~/utils/invariant";
import { errorToastIfFalsy, parseRequestPayload } from "~/utils/remix.server";
import { errorIsSqliteForeignKeyConstraintFailure } from "~/utils/sql";
import { assertUnreachable } from "~/utils/types";
import { SENDOUQ_PAGE, sendouQMatchPage } from "~/utils/urls";
import { groupAfterMorph } from "../core/groups";
import { membersNeededForFull } from "../core/groups.server";
import { FULL_GROUP_SIZE } from "../q-constants";
import { lookingSchema } from "../q-schemas.server";
import { addLike } from "../queries/addLike.server";
import { addManagerRole } from "../queries/addManagerRole.server";
import { chatCodeByGroupId } from "../queries/chatCodeByGroupId.server";
import { createMatch } from "../queries/createMatch.server";
import { deleteLike } from "../queries/deleteLike.server";
import { findCurrentGroupByUserId } from "../queries/findCurrentGroupByUserId.server";
import { groupHasMatch } from "../queries/groupHasMatch.server";
import { groupSize } from "../queries/groupSize.server";
import { groupSuccessorOwner } from "../queries/groupSuccessorOwner";
import { leaveGroup } from "../queries/leaveGroup.server";
import { likeExists } from "../queries/likeExists.server";
import { morphGroups } from "../queries/morphGroups.server";
import { refreshGroup } from "../queries/refreshGroup.server";
import { removeManagerRole } from "../queries/removeManagerRole.server";
import { updateNote } from "../queries/updateNote.server";

// this function doesn't throw normally because we are assuming
// if there is a validation error the user saw stale data
// and when we return null we just force a refresh
export const action: ActionFunction = async ({ request }) => {
	const user = await requireUser(request);
	const data = await parseRequestPayload({
		request,
		schema: lookingSchema,
	});
	const currentGroup = findCurrentGroupByUserId(user.id);
	if (!currentGroup) return null;

	// this throws because there should normally be no way user loses ownership by the action of some other user
	const validateIsGroupOwner = () =>
		errorToastIfFalsy(currentGroup.role === "OWNER", "Not  owner");
	const isGroupManager = () =>
		currentGroup.role === "MANAGER" || currentGroup.role === "OWNER";

	switch (data._action) {
		case "LIKE": {
			if (!isGroupManager()) return null;

			try {
				addLike({
					likerGroupId: currentGroup.id,
					targetGroupId: data.targetGroupId,
				});
			} catch (e) {
				if (!(e instanceof Error)) throw e;
				// the group disbanded before we could like it
				if (errorIsSqliteForeignKeyConstraintFailure(e)) return null;

				throw e;
			}
			refreshGroup(currentGroup.id);

			const targetChatCode = chatCodeByGroupId(data.targetGroupId);
			if (targetChatCode) {
				ChatSystemMessage.send({
					room: targetChatCode,
					type: "LIKE_RECEIVED",
					revalidateOnly: true,
				});
			}

			break;
		}
		case "RECHALLENGE": {
			if (!isGroupManager()) return null;

			await QRepository.rechallenge({
				likerGroupId: currentGroup.id,
				targetGroupId: data.targetGroupId,
			});

			const targetChatCode = chatCodeByGroupId(data.targetGroupId);
			if (targetChatCode) {
				ChatSystemMessage.send({
					room: targetChatCode,
					type: "LIKE_RECEIVED",
					revalidateOnly: true,
				});
			}
			break;
		}
		case "UNLIKE": {
			if (!isGroupManager()) return null;

			deleteLike({
				likerGroupId: currentGroup.id,
				targetGroupId: data.targetGroupId,
			});
			refreshGroup(currentGroup.id);

			break;
		}
		case "GROUP_UP": {
			if (!isGroupManager()) return null;
			if (
				!likeExists({
					targetGroupId: currentGroup.id,
					likerGroupId: data.targetGroupId,
				})
			) {
				return null;
			}

			const lookingGroups = await QRepository.findLookingGroups({
				maxGroupSize: membersNeededForFull(groupSize(currentGroup.id)),
				ownGroupId: currentGroup.id,
				includeChatCode: true,
			});

			const ourGroup = lookingGroups.find(
				(group) => group.id === currentGroup.id,
			);
			if (!ourGroup) return null;
			const theirGroup = lookingGroups.find(
				(group) => group.id === data.targetGroupId,
			);
			if (!theirGroup) return null;

			const { id: survivingGroupId } = groupAfterMorph({
				liker: "THEM",
				ourGroup,
				theirGroup,
			});

			const otherGroup =
				ourGroup.id === survivingGroupId ? theirGroup : ourGroup;

			invariant(ourGroup.members, "our group has no members");
			invariant(otherGroup.members, "other group has no members");

			morphGroups({
				survivingGroupId,
				otherGroupId: otherGroup.id,
				newMembers: otherGroup.members.map((m) => m.id),
			});
			refreshGroup(survivingGroupId);

			if (ourGroup.chatCode && theirGroup.chatCode) {
				ChatSystemMessage.send([
					{
						room: ourGroup.chatCode,
						type: "NEW_GROUP",
						revalidateOnly: true,
					},
					{
						room: theirGroup.chatCode,
						type: "NEW_GROUP",
						revalidateOnly: true,
					},
				]);
			}

			break;
		}
		case "MATCH_UP_RECHALLENGE":
		case "MATCH_UP": {
			if (!isGroupManager()) return null;
			if (
				!likeExists({
					targetGroupId: currentGroup.id,
					likerGroupId: data.targetGroupId,
				})
			) {
				return null;
			}

			const lookingGroups = await QRepository.findLookingGroups({
				minGroupSize: FULL_GROUP_SIZE,
				ownGroupId: currentGroup.id,
				includeChatCode: true,
			});

			const ourGroup = lookingGroups.find(
				(group) => group.id === currentGroup.id,
			);
			if (!ourGroup) return null;
			const theirGroup = lookingGroups.find(
				(group) => group.id === data.targetGroupId,
			);
			if (!theirGroup) return null;

			errorToastIfFalsy(
				ourGroup.members.length === FULL_GROUP_SIZE,
				"Our group is not full",
			);
			errorToastIfFalsy(
				theirGroup.members.length === FULL_GROUP_SIZE,
				"Their group is not full",
			);

			errorToastIfFalsy(
				!groupHasMatch(ourGroup.id),
				"Our group already has a match",
			);
			errorToastIfFalsy(
				!groupHasMatch(theirGroup.id),
				"Their group already has a match",
			);

			const ourGroupPreferences = await QRepository.mapModePreferencesByGroupId(
				ourGroup.id,
			);
			const theirGroupPreferences =
				await QRepository.mapModePreferencesByGroupId(theirGroup.id);
			const mapList = matchMapList(
				{
					id: ourGroup.id,
					preferences: ourGroupPreferences,
				},
				{
					id: theirGroup.id,
					preferences: theirGroupPreferences,
					ignoreModePreferences: data._action === "MATCH_UP_RECHALLENGE",
				},
			);
			const createdMatch = createMatch({
				alphaGroupId: ourGroup.id,
				bravoGroupId: theirGroup.id,
				mapList,
				memento: createMatchMemento({
					own: { group: ourGroup, preferences: ourGroupPreferences },
					their: { group: theirGroup, preferences: theirGroupPreferences },
					mapList,
				}),
			});

			if (ourGroup.chatCode && theirGroup.chatCode) {
				ChatSystemMessage.send([
					{
						room: ourGroup.chatCode,
						type: "MATCH_STARTED",
						revalidateOnly: true,
					},
					{
						room: theirGroup.chatCode,
						type: "MATCH_STARTED",
						revalidateOnly: true,
					},
				]);
			}

			notify({
				userIds: [
					...ourGroup.members.map((m) => m.id),
					...theirGroup.members.map((m) => m.id),
				],
				defaultSeenUserIds: [user.id],
				notification: {
					type: "SQ_NEW_MATCH",
					meta: {
						matchId: createdMatch.id,
					},
				},
			});

			throw redirect(sendouQMatchPage(createdMatch.id));
		}
		case "GIVE_MANAGER": {
			validateIsGroupOwner();

			addManagerRole({
				groupId: currentGroup.id,
				userId: data.userId,
			});
			refreshGroup(currentGroup.id);

			break;
		}
		case "REMOVE_MANAGER": {
			validateIsGroupOwner();

			removeManagerRole({
				groupId: currentGroup.id,
				userId: data.userId,
			});
			refreshGroup(currentGroup.id);

			break;
		}
		case "LEAVE_GROUP": {
			errorToastIfFalsy(
				!currentGroup.matchId,
				"Can't leave group while in a match",
			);
			let newOwnerId: number | null = null;
			if (currentGroup.role === "OWNER") {
				newOwnerId = groupSuccessorOwner(currentGroup.id);
			}

			leaveGroup({
				groupId: currentGroup.id,
				userId: user.id,
				newOwnerId,
				wasOwner: currentGroup.role === "OWNER",
			});

			const targetChatCode = chatCodeByGroupId(currentGroup.id);
			if (targetChatCode) {
				ChatSystemMessage.send({
					room: targetChatCode,
					type: "USER_LEFT",
					context: { name: user.username },
				});
			}

			throw redirect(SENDOUQ_PAGE);
		}
		case "KICK_FROM_GROUP": {
			validateIsGroupOwner();
			errorToastIfFalsy(data.userId !== user.id, "Can't kick yourself");

			leaveGroup({
				groupId: currentGroup.id,
				userId: data.userId,
				newOwnerId: null,
				wasOwner: false,
			});

			break;
		}
		case "REFRESH_GROUP": {
			refreshGroup(currentGroup.id);

			break;
		}
		case "UPDATE_NOTE": {
			updateNote({
				note: data.value,
				groupId: currentGroup.id,
				userId: user.id,
			});
			refreshGroup(currentGroup.id);

			break;
		}
		case "DELETE_PRIVATE_USER_NOTE": {
			await QRepository.deletePrivateUserNote({
				authorId: user.id,
				targetId: data.targetId,
			});

			break;
		}
		default: {
			assertUnreachable(data);
		}
	}

	return null;
};
