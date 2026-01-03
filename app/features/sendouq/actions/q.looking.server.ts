import type { ActionFunction } from "react-router";
import { redirect } from "react-router";
import { requireUser } from "~/features/auth/core/user.server";
import * as ChatSystemMessage from "~/features/chat/ChatSystemMessage.server";
import { notify } from "~/features/notifications/core/notify.server";
import * as SQGroupRepository from "~/features/sendouq/SQGroupRepository.server";
import {
	createMatchMemento,
	matchMapList,
} from "~/features/sendouq-match/core/match.server";
import * as SQMatchRepository from "~/features/sendouq-match/SQMatchRepository.server";
import { errorToastIfFalsy, parseRequestPayload } from "~/utils/remix.server";
import { assertUnreachable } from "~/utils/types";
import { SENDOUQ_PAGE, sendouQMatchPage } from "~/utils/urls";
import { groupAfterMorph } from "../core/groups";
import { refreshSendouQInstance, SendouQ } from "../core/SendouQ.server";
import * as PrivateUserNoteRepository from "../PrivateUserNoteRepository.server";
import { lookingSchema } from "../q-schemas.server";
import { resolveFutureMatchModes } from "../q-utils";
import { SendouQError } from "../q-utils.server";

// this function doesn't throw normally because we are assuming
// if there is a validation error the user saw stale data
// and when we return null we just force a refresh
export const action: ActionFunction = async ({ request }) => {
	const user = await requireUser();
	const data = await parseRequestPayload({
		request,
		schema: lookingSchema,
	});
	const currentGroup = SendouQ.findOwnGroup(user.id);
	if (!currentGroup) return null;

	try {
		// this throws because there should normally be no way user loses ownership by the action of some other user
		const validateIsGroupOwner = () =>
			errorToastIfFalsy(currentGroup.usersRole === "OWNER", "Not  owner");
		const isGroupManager = () =>
			currentGroup.usersRole === "MANAGER" ||
			currentGroup.usersRole === "OWNER";

		switch (data._action) {
			case "LIKE": {
				if (!isGroupManager()) return null;

				await SQGroupRepository.addLike({
					likerGroupId: currentGroup.id,
					targetGroupId: data.targetGroupId,
				});

				const targetChatCode = SendouQ.findUncensoredGroupById(
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

				await SQGroupRepository.rechallenge({
					likerGroupId: currentGroup.id,
					targetGroupId: data.targetGroupId,
				});

				const targetChatCode = SendouQ.findUncensoredGroupById(
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

				await SQGroupRepository.deleteLike({
					likerGroupId: currentGroup.id,
					targetGroupId: data.targetGroupId,
				});

				break;
			}
			case "GROUP_UP": {
				if (!isGroupManager()) return null;

				const allLikes = await SQGroupRepository.allLikesByGroupId(
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
			case "MATCH_UP": {
				if (!isGroupManager()) return null;

				const ownGroup = SendouQ.findOwnGroup(user.id);
				const theirGroup = SendouQ.findUncensoredGroupById(data.targetGroupId);
				if (!ownGroup || !theirGroup) return null;

				const ownGroupPreferences =
					await SQGroupRepository.mapModePreferencesByGroupId(ownGroup.id);
				const theirGroupPreferences =
					await SQGroupRepository.mapModePreferencesByGroupId(theirGroup.id);

				const modesIncluded = resolveFutureMatchModes(ownGroup, theirGroup);

				const mapList = await matchMapList(
					{
						id: ownGroup.id,
						preferences: ownGroupPreferences,
					},
					{
						id: theirGroup.id,
						preferences: theirGroupPreferences,
					},
					modesIncluded,
				);

				const createdMatch = await SQMatchRepository.create({
					alphaGroupId: ownGroup.id,
					bravoGroupId: theirGroup.id,
					mapList,
					memento: createMatchMemento({
						own: { group: ownGroup, preferences: ownGroupPreferences },
						their: { group: theirGroup, preferences: theirGroupPreferences },
						mapList,
					}),
				});

				await refreshSendouQInstance();

				if (ownGroup.chatCode && theirGroup.chatCode) {
					ChatSystemMessage.send([
						{
							room: ownGroup.chatCode,
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
						...ownGroup.members.map((m) => m.id),
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

				await SQGroupRepository.updateMemberRole({
					groupId: currentGroup.id,
					userId: data.userId,
					role: "MANAGER",
				});

				await refreshSendouQInstance();

				break;
			}
			case "REMOVE_MANAGER": {
				validateIsGroupOwner();

				await SQGroupRepository.updateMemberRole({
					groupId: currentGroup.id,
					userId: data.userId,
					role: "REGULAR",
				});

				await refreshSendouQInstance();

				break;
			}
			case "LEAVE_GROUP": {
				await SQGroupRepository.leaveGroup(user.id);

				await refreshSendouQInstance();

				const targetChatCode = SendouQ.findUncensoredGroupById(
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

				await SQGroupRepository.leaveGroup(data.userId);

				await refreshSendouQInstance();

				break;
			}
			case "REFRESH_GROUP": {
				await SQGroupRepository.refreshGroup(currentGroup.id);

				await refreshSendouQInstance();

				break;
			}
			case "UPDATE_NOTE": {
				await SQGroupRepository.updateMemberNote({
					groupId: currentGroup.id,
					userId: user.id,
					value: data.value,
				});

				await refreshSendouQInstance();

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
