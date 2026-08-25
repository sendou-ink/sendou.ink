import type * as ChatRepository from "./ChatRepository.server";
import * as ChatRoomResolver from "./ChatRoomResolver.server";
import type { ChatRoomListItem } from "./chat-types";

type MessageStats = Awaited<
	ReturnType<typeof ChatRepository.findMessageStatsByRoomIds>
>[number];

/** Shapes a resolved room into the list item the chat client consumes. */
export function roomListItem(
	room: ChatRoomResolver.ResolvedRoom,
	stats: MessageStats | undefined,
	userId: number,
): ChatRoomListItem {
	return {
		id: room.roomId,
		type: room.type,
		titleParams: room.titleParams,
		url: room.url,
		imageUrl: room.imageUrl,
		participantUserIds: room.participantUserIds,
		expiresAt: room.expiresAt,
		inactive: room.inactive,
		canPost: ChatRoomResolver.canPost(room, userId),
		unreadCount: stats?.unreadCount ?? 0,
		latestMessageId: stats?.latestMessageId ?? null,
		latestMessageAt: stats?.latestMessageCreatedAt ?? null,
	};
}
