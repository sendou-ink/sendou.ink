import type {
	ChatMessageWithAuthor,
	RevalidateScope,
} from "~/features/chat/chat-types";

/** How often the server writes a heartbeat to an open SSE connection, so the client can tell a silently dead one apart. */
export const HEARTBEAT_INTERVAL_MS = 25_000;

/** Prefix of each entity scoped channel, joined to the entity's id by the channel's builder. */
export const CHANNEL_PREFIX = {
	user: "user__",
	chatRoom: "chat-room__",
	tournament: "tournament__",
	tournamentMatch: "match__",
	sqGroup: "sq-group__",
} as const;

/** Channel delivering events addressed to the user across all of their connections. */
export function userChannel(userId: number): string {
	return `${CHANNEL_PREFIX.user}${userId}`;
}

/** Channel delivering a chat room's events to its viewers. */
export function chatRoomChannel(roomId: number): string {
	return `${CHANNEL_PREFIX.chatRoom}${roomId}`;
}

export type ServerEvent =
	| { kind: "chatMessage"; roomId: number; message: ChatMessageWithAuthor }
	| { kind: "revalidate"; scope?: RevalidateScope; authorUserId?: number }
	| { kind: "notificationsChanged" }
	| { kind: "roomsChanged" }
	| { kind: "statusChanged" };
