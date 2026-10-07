import * as React from "react";
import type { CommonUser } from "~/utils/kysely.server";
import type { ClientChatMessage } from "../chat-types";

export const MessagesContext = React.createContext<{
	usersById: Map<number, CommonUser>;
	ownUserId: number | null;
	messagesById: Map<number, ClientChatMessage>;
	onReply: ((message: ClientChatMessage) => void) | null;
	replyingToMessageId: number | null;
	onJumpToMessage: (messageId: number) => void;
}>({
	usersById: new Map(),
	ownUserId: null,
	messagesById: new Map(),
	onReply: null,
	replyingToMessageId: null,
	onJumpToMessage: () => {},
});
