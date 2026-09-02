import { requireUser } from "~/features/auth/core/user.server";
import * as ChatRepository from "../ChatRepository.server";
import * as ChatRoomResolver from "../ChatRoomResolver.server";
import { roomListItem } from "../chat-room-list.server";
import type { ChatRoomListItem } from "../chat-types";

/** The user's open chat rooms with unread counts; fetched after mount and refetched on `chatMessage` / `roomsChanged` events, never riding a page loader. */
export const loader = async (): Promise<{ rooms: ChatRoomListItem[] }> => {
	const user = requireUser();

	const rooms = await ChatRoomResolver.findAllByUserId(user.id);
	const messageStats = await ChatRepository.findMessageStatsByRoomIds(
		user.id,
		rooms.map((room) => room.roomId),
	);
	const statsByRoomId = new Map(messageStats.map((row) => [row.roomId, row]));

	return {
		rooms: rooms.map((room) =>
			roomListItem(room, statsByRoomId.get(room.roomId), user),
		),
	};
};
