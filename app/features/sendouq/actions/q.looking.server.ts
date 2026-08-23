import type { ActionFunction } from "react-router";
import { redirect } from "react-router";
import { requireUser } from "~/features/auth/core/user.server";
import * as ChatSystemMessage from "~/features/chat/ChatSystemMessage.server";
import * as Seasons from "~/features/mmr/core/Seasons";
import * as SQGroupRepository from "~/features/sendouq/SQGroupRepository.server";
import { parseFormData } from "~/form/parse.server";
import { errorToastIfFalsy } from "~/utils/remix.server";
import { assertUnreachable } from "~/utils/types";
import { SENDOUQ_PAGE, SENDOUQ_READY_PAGE } from "~/utils/urls";
import { canSuggest, groupAfterMorph, isInLookingPool } from "../core/groups";
import * as ReadyCheck from "../core/ready-check.server";
import { refreshSendouQInstance, SendouQ } from "../core/SendouQ.server";
import { lookingSchema } from "../q-action-schemas";
import {
	FULL_GROUP_SIZE,
	SENDOUQ_LOOKING_ROOM,
	sqGroupWebsocketRoom,
} from "../q-constants";
import { SendouQError, setGroupChatMetadata } from "../q-utils.server";

// this function doesn't throw normally because we are assuming
// if there is a validation error the user saw stale data
// and when we return null we just force a refresh
export const action: ActionFunction = async ({ request }) => {
	const user = requireUser();
	const result = await parseFormData({
		request,
		schema: lookingSchema,
	});

	if (!result.success) {
		return { fieldErrors: result.fieldErrors };
	}

	const data = result.data;

	const currentGroup = SendouQ.findOwnGroup(user.id);
	if (!currentGroup) return null;

	if (data._action !== "LEAVE_GROUP" && !isInLookingPool(currentGroup)) {
		return null;
	}

	const broadcastLookingUpdate = () =>
		ChatSystemMessage.send({
			room: SENDOUQ_LOOKING_ROOM,
			revalidateOnly: true,
		});

	const revalidateGroupTopic = (groupId: number) =>
		ChatSystemMessage.send({
			room: sqGroupWebsocketRoom(groupId),
			revalidateOnly: true,
		});

	const notifyLikeReceived = (groupId: number) =>
		ChatSystemMessage.send({
			room: sqGroupWebsocketRoom(groupId),
			type: "LIKE_RECEIVED",
			revalidateOnly: true,
		});

	try {
		switch (data._action) {
			case "LIKE": {
				await SQGroupRepository.insertLike({
					likerGroupId: currentGroup.id,
					targetGroupId: data.targetGroupId,
					createdByUserId: user.id,
				});

				notifyLikeReceived(data.targetGroupId);
				revalidateGroupTopic(currentGroup.id);

				break;
			}
			case "SUGGEST": {
				if (!canSuggest(currentGroup)) return null;

				const targetIsInPool = SendouQ.lookingGroups(user.id).some(
					(group) => group.id === data.targetGroupId,
				);
				if (!targetIsInPool) return null;

				// a group we already invited needs no pointing out
				const likes = await SQGroupRepository.findAllLikesByGroupId(
					currentGroup.id,
				);
				if (likes.given.some((like) => like.groupId === data.targetGroupId)) {
					return null;
				}

				await SQGroupRepository.insertSuggestion({
					suggesterGroupId: currentGroup.id,
					targetGroupId: data.targetGroupId,
					createdByUserId: user.id,
				});

				revalidateGroupTopic(currentGroup.id);

				break;
			}
			case "RECHALLENGE": {
				await SQGroupRepository.rechallenge({
					likerGroupId: currentGroup.id,
					targetGroupId: data.targetGroupId,
				});

				notifyLikeReceived(data.targetGroupId);
				revalidateGroupTopic(currentGroup.id);
				break;
			}
			case "UNLIKE": {
				await SQGroupRepository.deleteLike({
					likerGroupId: currentGroup.id,
					targetGroupId: data.targetGroupId,
				});

				revalidateGroupTopic(data.targetGroupId);
				revalidateGroupTopic(currentGroup.id);

				break;
			}
			case "GROUP_UP": {
				const allLikes = await SQGroupRepository.findAllLikesByGroupId(
					data.targetGroupId,
				);
				if (!allLikes.given.some((like) => like.groupId === currentGroup.id)) {
					return null;
				}

				const ourGroup = SendouQ.findOwnGroup(user.id);
				const theirGroup = SendouQ.findUncensoredGroupById(data.targetGroupId);
				if (!ourGroup || !theirGroup) return null;

				const { id: survivingGroupId } = groupAfterMorph({
					liker: "THEM",
					ourGroup,
					theirGroup,
				});

				const otherGroup =
					ourGroup.id === survivingGroupId ? theirGroup : ourGroup;

				await SQGroupRepository.morphGroups({
					survivingGroupId,
					otherGroupId: otherGroup.id,
				});

				await refreshSendouQInstance();

				if (ourGroup.chatCode) {
					ChatSystemMessage.removeRoom(ourGroup.chatCode);
				}
				if (theirGroup.chatCode) {
					ChatSystemMessage.removeRoom(theirGroup.chatCode);
				}

				const survivingGroup =
					SendouQ.findUncensoredGroupById(survivingGroupId);
				if (survivingGroup?.chatCode) {
					setGroupChatMetadata({
						chatCode: survivingGroup.chatCode,
						members: survivingGroup.members,
					});
				}

				broadcastLookingUpdate();

				break;
			}
			case "MATCH_UP": {
				errorToastIfFalsy(Seasons.current(), "Season is not active");

				const ownGroup = SendouQ.findOwnGroup(user.id);
				const theirGroup = SendouQ.findUncensoredGroupById(data.targetGroupId);
				if (!ownGroup || !theirGroup) return null;

				const allLikes = await SQGroupRepository.findAllLikesByGroupId(
					data.targetGroupId,
				);
				if (!allLikes.given.some((like) => like.groupId === ownGroup.id)) {
					return null;
				}

				const bothCanPlay = [ownGroup, theirGroup].every(
					(group) => group.members.length === FULL_GROUP_SIZE && !group.matchId,
				);
				if (!bothCanPlay) return null;

				await ReadyCheck.start({
					ownGroup,
					theirGroup,
					actorUserId: user.id,
				});

				throw redirect(SENDOUQ_READY_PAGE);
			}
			case "LEAVE_GROUP": {
				const { abortedReadyCheckGroupIds } =
					await SQGroupRepository.leaveGroup(user.id);

				await refreshSendouQInstance();

				// the group that was about to play them is free to look again
				for (const groupId of abortedReadyCheckGroupIds) {
					revalidateGroupTopic(groupId);
				}

				const remainingGroup = SendouQ.findUncensoredGroupById(currentGroup.id);
				if (remainingGroup?.chatCode) {
					ChatSystemMessage.send({
						room: remainingGroup.chatCode,
						type: "USER_LEFT",
						context: { name: user.username },
					});
					setGroupChatMetadata({
						chatCode: remainingGroup.chatCode,
						members: remainingGroup.members,
					});
				}

				broadcastLookingUpdate();

				throw redirect(SENDOUQ_PAGE);
			}
			case "KICK_FROM_GROUP": {
				errorToastIfFalsy(data.userId !== user.id, "Can't kick yourself");
				errorToastIfFalsy(
					(
						await SQGroupRepository.findAllMissedReadyCheckUserIdsByGroupId(
							currentGroup.id,
						)
					).includes(data.userId),
					"Only a member who missed a ready check can be kicked",
				);

				const kickedMember = currentGroup.members.find(
					(member) => member.id === data.userId,
				);

				await SQGroupRepository.leaveGroup(data.userId);

				await refreshSendouQInstance();

				const groupAfterKick = SendouQ.findUncensoredGroupById(currentGroup.id);
				if (groupAfterKick?.chatCode && kickedMember) {
					ChatSystemMessage.send({
						room: groupAfterKick.chatCode,
						type: "USER_LEFT",
						context: { name: kickedMember.username },
					});
					setGroupChatMetadata({
						chatCode: groupAfterKick.chatCode,
						members: groupAfterKick.members,
					});
				}

				broadcastLookingUpdate();

				break;
			}
			case "REFRESH_GROUP": {
				await SQGroupRepository.refreshGroup(currentGroup.id);

				await refreshSendouQInstance();

				broadcastLookingUpdate();

				break;
			}
			case "UPDATE_NOTE": {
				await SQGroupRepository.updateOwnMemberNote({
					groupId: currentGroup.id,
					value: data.value,
				});

				await refreshSendouQInstance();

				broadcastLookingUpdate();

				break;
			}
			default: {
				assertUnreachable(data);
			}
		}

		return null;
	} catch (error) {
		// some errors are expected to happen, for example they might request two groups at the same time
		// then after morphing one group the other request fails because the group no longer exists
		// return null causes loaders to run and they see the fresh state again instead of error page
		if (error instanceof SendouQError) {
			return null;
		}

		throw error;
	}
};
