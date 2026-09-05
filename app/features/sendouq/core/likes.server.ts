import * as R from "remeda";
import * as ChatSystemMessage from "~/features/chat/ChatSystemMessage.server";
import * as SQGroupRepository from "~/features/sendouq/SQGroupRepository.server";
import {
	FULL_GROUP_SIZE,
	SENDOUQ_LOOKING_CHANNEL,
	sqGroupChannel,
} from "../q-constants";
import { refreshSendouQInstance, SendouQ } from "./SendouQ.server";

/** Cancels every pending challenge involving the user's active full group. Partial groups merge rather than start a match on accept, so their preferences are not locked in yet. */
export async function cancelActiveGroupLikes(userId: number) {
	const ownGroup = SendouQ.findOwnGroup(userId);
	if (!ownGroup) return;
	if (ownGroup.status !== "ACTIVE" || ownGroup.matchId) return;
	if (ownGroup.members.length !== FULL_GROUP_SIZE) return;

	const likes = await SQGroupRepository.findAllLikesByGroupId(ownGroup.id);
	const affectedGroupIds = R.unique([
		...likes.given.map((like) => like.groupId),
		...likes.received.map((like) => like.groupId),
	]);
	if (affectedGroupIds.length === 0) return;

	await SQGroupRepository.deleteAllLikesByGroupId(ownGroup.id);

	await refreshSendouQInstance();

	ChatSystemMessage.send([
		...[...affectedGroupIds, ownGroup.id].map((groupId) => ({
			channel: sqGroupChannel(groupId),
		})),
		{ channel: SENDOUQ_LOOKING_CHANNEL },
	]);
}
