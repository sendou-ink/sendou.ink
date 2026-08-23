import type {
	ChatMessageWithAuthor,
	RevalidateScope,
	SoundOnlySystemMessageType,
} from "~/features/chat/chat-types";

/** Channel delivering events addressed to the user across all of their connections. */
export function userChannel(userId: number): string {
	return `user__${userId}`;
}

/** Channel delivering a chat room's events to its viewers. */
export function chatRoomChannel(roomId: number): string {
	return `chat-room__${roomId}`;
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
