import * as EventBus from "~/features/events/core/EventBus.server";
import { userChannel } from "~/features/events/events-types";
import * as VoiceRepository from "../VoiceRepository.server";

const tokenByRoomUser = new Map<string, string>();

/** E2E stand-in for Daily's meeting token, remembered so an ejection can name the call it ends. */
export function createMeetingToken({
	chatRoomId,
	userId,
}: {
	chatRoomId: number;
	userId: number;
}) {
	const token = `e2e-${crypto.randomUUID()}`;
	tokenByRoomUser.set(roomUserKey(chatRoomId, userId), token);

	return token;
}

/** E2E stand-in for Daily's eject, ending the users' fake calls in the browser like Daily disconnecting them. */
export function ejectUsers({
	chatRoomId,
	userIds,
}: {
	chatRoomId: number;
	userIds: number[];
}) {
	for (const userId of userIds) {
		const key = roomUserKey(chatRoomId, userId);
		const token = tokenByRoomUser.get(key);
		if (!token) continue;

		tokenByRoomUser.delete(key);
		EventBus.publish([userChannel(userId)], {
			kind: "voiceEjected",
			roomId: chatRoomId,
			token,
		});
	}
}

/** E2E stand-in for Daily's presence: whoever connected and hasn't left. */
export function findPresentUserIds(chatRoomId: number) {
	return VoiceRepository.findConnectedUserIds(chatRoomId);
}

function roomUserKey(chatRoomId: number, userId: number) {
	return `${chatRoomId}:${userId}`;
}
