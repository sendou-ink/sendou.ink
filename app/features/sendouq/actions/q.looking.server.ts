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
	SENDOUQ_LOOKING_CHANNEL,
	sqGroupChannel,
} from "../q-constants";
import { SendouQError } from "../q-utils.server";

// a validation error means the user saw stale data, so instead of throwing
// this returns null to force a refresh
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
		ChatSystemMessage.send({ channel: SENDOUQ_LOOKING_CHANNEL });

	const revalidateGroupTopic = (groupId: number) =>
		ChatSystemMessage.send({ channel: sqGroupChannel(groupId) });

	const notifyLikeReceived = (groupId: number) =>
		ChatSystemMessage.send({
			channel: sqGroupChannel(groupId),
			type: "LIKE_RECEIVED",
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

				// both old rooms died and a fresh merged room was created
				ChatSystemMessage.notifyRoomsChanged(
					[...ourGroup.members, ...theirGroup.members].map(
						(member) => member.id,
					),
				);

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
				if (remainingGroup?.chatRoomId) {
					ChatSystemMessage.sendPersisted({
						roomId: remainingGroup.chatRoomId,
						type: "USER_LEFT",
						authorUserId: user.id,
					});
				}

				ChatSystemMessage.notifyRoomsChanged(
					currentGroup.members.map((member) => member.id),
				);

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
				if (groupAfterKick?.chatRoomId && kickedMember) {
					ChatSystemMessage.sendPersisted({
						roomId: groupAfterKick.chatRoomId,
						type: "USER_LEFT",
						authorUserId: kickedMember.id,
					});
				}

				ChatSystemMessage.notifyRoomsChanged(
					currentGroup.members.map((member) => member.id),
				);

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
		// expected errors (e.g. two groups requested at once, the second failing once the first
		// morphed): return null so loaders re-run and the user sees the fresh state
		if (error instanceof SendouQError) {
			return null;
		}

		throw error;
	}
};
