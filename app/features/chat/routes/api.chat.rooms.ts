import { requireUser } from "~/features/auth/core/user.server";
import * as ChatRepository from "../ChatRepository.server";
import * as ChatRoomResolver from "../ChatRoomResolver.server";

/**
 * The user's open chat rooms with server-computed unread counts. A background
 * resource like the notifications peek: fetched after mount and refetched on
 * `chatMessage` / `roomsChanged` events instead of riding any page loader.
 */
export const loader = async () => {
	const user = requireUser();

	const rooms = await ChatRoomResolver.findAllByUserId(user.id);
	const unreadCounts = await ChatRepository.findUnreadCountsByRoomIds(
		user.id,
		rooms.map((room) => room.roomId),
	);
	const unreadCountByRoomId = new Map(
		unreadCounts.map((row) => [row.roomId, row.unreadCount]),
	);

	return {
		rooms: rooms.map((room) => ({
			id: room.roomId,
			type: room.type,
			titleParams: room.titleParams,
			url: room.url,
			imageUrl: room.imageUrl,
			participantUserIds: room.participantUserIds,
			expiresAt: room.expiresAt,
			unreadCount: unreadCountByRoomId.get(room.roomId) ?? 0,
		})),
	};
};
