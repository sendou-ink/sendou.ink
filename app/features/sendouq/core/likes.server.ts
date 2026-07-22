import * as R from "remeda";
import * as ChatSystemMessage from "~/features/chat/ChatSystemMessage.server";
import * as SQGroupRepository from "~/features/sendouq/SQGroupRepository.server";
import {
	FULL_GROUP_SIZE,
	SENDOUQ_LOOKING_ROOM,
	sqGroupWebsocketRoom,
} from "../q-constants";
import { refreshSendouQInstance, SendouQ } from "./SendouQ.server";

/**
 * Cancels every pending challenge (both given and received) involving the user's
 * active and full SendouQ group. Only full groups are affected: partial groups
 * merge (rather than start a match) when a request is accepted, so their members'
 * preferences are not yet locked in.
 */
export async function cancelActiveGroupLikes(userId: number) {
	const ownGroup = SendouQ.findOwnGroup(userId);
	if (!ownGroup) return;
	if (ownGroup.status !== "ACTIVE" || ownGroup.matchId) return;
	if (ownGroup.members.length !== FULL_GROUP_SIZE) return;

	const likes = await SQGroupRepository.allLikesByGroupId(ownGroup.id);
	const affectedGroupIds = R.unique([
		...likes.given.map((like) => like.groupId),
		...likes.received.map((like) => like.groupId),
	]);
	if (affectedGroupIds.length === 0) return;

	await SQGroupRepository.deleteAllLikesByGroupId(ownGroup.id);

	await refreshSendouQInstance();

	ChatSystemMessage.send([
		...[...affectedGroupIds, ownGroup.id].map((groupId) => ({
			room: sqGroupWebsocketRoom(groupId),
			revalidateOnly: true,
		})),
		{
			room: SENDOUQ_LOOKING_ROOM,
			revalidateOnly: true,
		},
	]);
}
