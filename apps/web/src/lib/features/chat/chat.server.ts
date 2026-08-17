import { addHours } from "date-fns";
import * as Events from "#lib/server/events.ts";
import {
	databaseTimestampToDate,
	dateToDatabaseTimestamp,
} from "#lib/utils/dates.ts";
import { CHAT } from "./chat-constants.ts";
import type { ChatMessageContext, ChatSystemMessageType } from "./chat-types.ts";
import * as ChatRepository from "./ChatRepository.server.ts";

/**
 * Feature-facing chat glue: room provisioning, system messages and the wake-up
 * publishes that drive the live queries. Mutations in other features call
 * these instead of touching the chat repository directly.
 */

/** The scrim's room, created on first access (rooms turn inactive a while after the scrim starts). */
export function ensureScrimChatRoom({
	scrimPostId,
	startsAt,
}: {
	scrimPostId: number;
	/** Database timestamp of when the scrim starts */
	startsAt: number;
}) {
	return ChatRepository.ensureRoomForScrim({
		scrimPostId,
		inactiveAt: dateToDatabaseTimestamp(
			addHours(
				databaseTimestampToDate(startsAt),
				CHAT.SCRIM_ROOM_INACTIVE_AFTER_START_HOURS,
			),
		),
	});
}

/** Wakes the room's message streams and its members' room lists. */
export async function publishChatRoom(chatRoomId: number) {
	Events.publish(Events.chatRoomChannel(chatRoomId));

	for (const memberId of await ChatRepository.findRoomMemberIds(chatRoomId)) {
		Events.publish(Events.chatRoomsOfUserChannel(memberId));
	}
}

export async function sendSystemMessage({
	chatRoomId,
	type,
	context,
}: {
	chatRoomId: number;
	type: ChatSystemMessageType;
	context?: ChatMessageContext;
}) {
	await ChatRepository.insertSystemMessage({ chatRoomId, type, context });
	await publishChatRoom(chatRoomId);
}

/** A scrim getting canceled turns its room inactive right away (gg's window still applies). */
export async function markScrimChatRoomInactive(scrimPostId: number) {
	const room = await ChatRepository.findRoomByScrimPostId(scrimPostId);
	if (!room) return;

	await ChatRepository.setRoomInactiveAt(room.id, new Date());
	await publishChatRoom(room.id);
}

/** Permanently deletes rooms that have been inactive for over a week. */
export async function deleteInactiveChatRooms() {
	await ChatRepository.deleteRoomsInactiveForAWeek();
}
