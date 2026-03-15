import * as React from "react";
import type { ChatContextValue } from "./chat-provider-types";

// xxx: think how chats should expire in relation to chatCode getting returned from loaders etc.

export const ChatContext = React.createContext<ChatContextValue | null>(null);

export function useChatContext(): ChatContextValue | null {
	return React.useContext(ChatContext);
}
