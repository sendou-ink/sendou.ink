import { requireUser } from "~/features/auth/core/user.server";
import * as ChatRepository from "../ChatRepository.server";
import * as ChatRoomResolver from "../ChatRoomResolver.server";
import type { ChatRoomListItem } from "../chat-types";

/**
 * The user's open chat rooms with server-computed unread counts. A background
 * resource like the notifications peek: fetched after mount and refetched on
 * `chatMessage` / `roomsChanged` events instead of riding any page loader.
 */
export const loader = async (): Promise<{ rooms: ChatRoomListItem[] }> => {
	const user = requireUser();

	const rooms = await ChatRoomResolver.findAllByUserId(user.id);
	const messageStats = await ChatRepository.findMessageStatsByRoomIds(
		user.id,
		rooms.map((room) => room.roomId),
	);
	const statsByRoomId = new Map(messageStats.map((row) => [row.roomId, row]));

	return {
		rooms: rooms.map((room) => {
			const stats = statsByRoomId.get(room.roomId);

			return {
				id: room.roomId,
				type: room.type,
				titleParams: room.titleParams,
				url: room.url,
				imageUrl: room.imageUrl,
				participantUserIds: room.participantUserIds,
				expiresAt: room.expiresAt,
				inactive: room.inactive,
				unreadCount: stats?.unreadCount ?? 0,
				latestMessageId: stats?.latestMessageId ?? null,
				latestMessageAt: stats?.latestMessageCreatedAt ?? null,
			};
		}),
	};
};
