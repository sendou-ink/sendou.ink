import type {
	ChatMessageWithAuthor,
	RevalidateScope,
	SoundOnlySystemMessageType,
} from "~/features/chat/chat-types";

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
	| {
			kind: "revalidate";
			scope?: RevalidateScope;
			authorUserId?: number;
			type?: SoundOnlySystemMessageType;
	  }
	| { kind: "notificationsChanged" }
	| { kind: "roomsChanged" };
