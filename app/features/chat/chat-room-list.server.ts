import { hasPermission } from "~/modules/permissions/utils";
import * as ChatRepository from "./ChatRepository.server";
import * as ChatRoomResolver from "./ChatRoomResolver.server";
import type { ChatRoomListItem } from "./chat-types";

type MessageStats = Awaited<
	ReturnType<typeof ChatRepository.findMessageStatsByRoomIds>
>[number];

/** The user's open rooms as the chat sidebar lists them, with unread counts; the root loader's first snapshot and the `GET /api/chat/rooms` refetch alike. */
export async function resolveRoomList(user: {
	id: number;
}): Promise<ChatRoomListItem[]> {
	const rooms = await ChatRoomResolver.findAllByUserId(user.id);
	const messageStats = await ChatRepository.findMessageStatsByRoomIds(
		user.id,
		rooms.map((room) => room.roomId),
	);
	const statsByRoomId = new Map(messageStats.map((row) => [row.roomId, row]));

	return rooms.map((room) =>
		roomListItem(room, statsByRoomId.get(room.roomId), user),
	);
}

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
