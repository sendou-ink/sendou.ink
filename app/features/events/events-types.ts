import type {
	ChatMessageWithAuthor,
	RevalidateScope,
	SoundOnlySystemMessageType,
} from "~/features/chat/chat-types";

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
