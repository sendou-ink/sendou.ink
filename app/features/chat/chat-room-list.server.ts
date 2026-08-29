import { hasPermission } from "~/modules/permissions/utils";
import type * as ChatRepository from "./ChatRepository.server";
import type * as ChatRoomResolver from "./ChatRoomResolver.server";
import type { ChatRoomListItem } from "./chat-types";

type MessageStats = Awaited<
	ReturnType<typeof ChatRepository.findMessageStatsByRoomIds>
>[number];

/** Shapes a resolved room into the list item the chat client consumes. */
export function roomListItem(
	room: ChatRoomResolver.ResolvedRoom,
	stats: MessageStats | undefined,
	user: { id: number },
): ChatRoomListItem {
	return {
		id: room.roomId,
		type: room.type,
		titleParams: room.titleParams,
		url: room.url,
		imageUrl: room.imageUrl,
		participantUserIds: room.participantUserIds,
		labelByUserId: room.labelByUserId,
		expiresAt: room.expiresAt,
		inactive: room.inactive,
		canPost: hasPermission(room, "POST", user),
		unreadCount: stats?.unreadCount ?? 0,
		latestMessageId: stats?.latestMessageId ?? null,
		latestMessageAt: stats?.latestMessageCreatedAt ?? null,
	};
}
