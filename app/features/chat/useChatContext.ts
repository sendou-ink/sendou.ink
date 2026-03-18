import * as React from "react";
import type { ChatContextValue } from "./chat-provider-types";

export const ChatContext = React.createContext<ChatContextValue | null>(null);

export function useChatContext(): ChatContextValue | null {
	return React.useContext(ChatContext);
}
