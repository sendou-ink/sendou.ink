import type { ActionFunction } from "@remix-run/node";
import { redirect } from "@remix-run/node";
import { requireUser } from "~/features/auth/core/user.server";
import * as ChatSystemMessage from "~/features/chat/ChatSystemMessage.server";
import { notify } from "~/features/notifications/core/notify.server";
import * as QRepository from "~/features/sendouq/QRepository.server";
import {
	createMatchMemento,
	matchMapList,
} from "~/features/sendouq-match/core/match.server";
import * as QMatchRepository from "~/features/sendouq-match/QMatchRepository.server";
import { errorToastIfFalsy, parseRequestPayload } from "~/utils/remix.server";
import { assertUnreachable } from "~/utils/types";
import { SENDOUQ_PAGE, sendouQMatchPage } from "~/utils/urls";
import { groupAfterMorph } from "../core/groups";
import { refreshSQManagerInstance, SQManager } from "../core/SQManager.server";
import * as PrivateUserNoteRepository from "../PrivateUserNoteRepository.server";
import { lookingSchema } from "../q-schemas.server";

// xxx: refactor to action -> check DB style

// this function doesn't throw normally because we are assuming
// if there is a validation error the user saw stale data
// and when we return null we just force a refresh
export const action: ActionFunction = async ({ request }) => {
	const user = await requireUser(request);
	const data = await parseRequestPayload({
		request,
		schema: lookingSchema,
	});
	const currentGroup = SQManager.findOwnGroup(user.id);
	if (!currentGroup) return null;

	// this throws because there should normally be no way user loses ownership by the action of some other user
	const validateIsGroupOwner = () =>
		errorToastIfFalsy(currentGroup.usersRole === "OWNER", "Not  owner");
	const isGroupManager = () =>
		currentGroup.usersRole === "MANAGER" || currentGroup.usersRole === "OWNER";

	switch (data._action) {
		case "LIKE": {
			if (!isGroupManager()) return null;

			await QRepository.addLike({
				likerGroupId: currentGroup.id,
				targetGroupId: data.targetGroupId,
			});

			const targetChatCode = SQManager.findUncensoredGroupById(
				data.targetGroupId,
			)?.chatCode;
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

			const targetChatCode = SQManager.findUncensoredGroupById(
				data.targetGroupId,
			)?.chatCode;
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

			await QRepository.deleteLike({
				likerGroupId: currentGroup.id,
				targetGroupId: data.targetGroupId,
			});

			break;
		}
		case "GROUP_UP": {
			if (!isGroupManager()) return null;

			const allLikes = await QRepository.allLikesByGroupId(data.targetGroupId);
			if (!allLikes.given.some((like) => like.groupId === currentGroup.id)) {
				return null;
			}

			const ourGroup = SQManager.findOwnGroup(user.id);
			const theirGroup = SQManager.findUncensoredGroupById(data.targetGroupId);
			if (!ourGroup || !theirGroup) return null;

			const { id: survivingGroupId } = groupAfterMorph({
				liker: "THEM",
				ourGroup,
				theirGroup,
			});

			const otherGroup =
				ourGroup.id === survivingGroupId ? theirGroup : ourGroup;

			await QRepository.morphGroups({
				survivingGroupId,
				otherGroupId: otherGroup.id,
			});

			await refreshSQManagerInstance();

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

			const ourGroup = SQManager.findOwnGroup(user.id);
			const theirGroup = SQManager.findUncensoredGroupById(data.targetGroupId);
			if (!ourGroup || !theirGroup) return null;

			const ourGroupPreferences = await QRepository.mapModePreferencesByGroupId(
				ourGroup.id,
			);
			const theirGroupPreferences =
				await QRepository.mapModePreferencesByGroupId(theirGroup.id);
			const mapList = await matchMapList(
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

			const createdMatch = await QMatchRepository.create({
				alphaGroupId: ourGroup.id,
				bravoGroupId: theirGroup.id,
				mapList,
				memento: createMatchMemento({
					own: { group: ourGroup, preferences: ourGroupPreferences },
					their: { group: theirGroup, preferences: theirGroupPreferences },
					mapList,
				}),
			});

			await refreshSQManagerInstance();

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

			await QRepository.updateMemberRole({
				groupId: currentGroup.id,
				userId: data.userId,
				role: "MANAGER",
			});

			await refreshSQManagerInstance();

			break;
		}
		case "REMOVE_MANAGER": {
			validateIsGroupOwner();

			await QRepository.updateMemberRole({
				groupId: currentGroup.id,
				userId: data.userId,
				role: "REGULAR",
			});

			await refreshSQManagerInstance();

			break;
		}
		case "LEAVE_GROUP": {
			await QRepository.leaveGroup(user.id);

			await refreshSQManagerInstance();

			const targetChatCode = SQManager.findUncensoredGroupById(
				currentGroup.id,
			)?.chatCode;
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

			await QRepository.leaveGroup(data.userId);

			await refreshSQManagerInstance();

			break;
		}
		case "REFRESH_GROUP": {
			await QRepository.refreshGroup(currentGroup.id);

			await refreshSQManagerInstance();

			break;
		}
		case "UPDATE_NOTE": {
			await QRepository.updateMemberNote({
				groupId: currentGroup.id,
				userId: user.id,
				value: data.value,
			});

			await refreshSQManagerInstance();

			break;
		}
		case "DELETE_PRIVATE_USER_NOTE": {
			await PrivateUserNoteRepository.del({
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
