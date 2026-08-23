import type { ChatRoomListItem, ClientChatMessage } from "./chat-types";

export interface ChatContextValue {
	/** False until the first rooms fetch has landed. */
	roomsLoaded: boolean;
	rooms: ChatRoomListItem[];
	/** Looks a room up from the list or the route-opened extra rooms (observer access). */
	roomForId: (roomId: number) => ChatRoomListItem | undefined;
	messagesForRoom: (roomId: number) => ClientChatMessage[];
	/** Fetches the room's history unless it is already loaded or loading. */
	ensureMessagesLoaded: (roomId: number) => void;
	/** Sends the message outside the router (no revalidation), rendering it optimistically until the echo or POST response confirms it. */
	sendMessage: (
		roomId: number,
		message: { publicId: string; contents: string },
	) => void;
	markAsRead: (roomId: number) => void;
	totalUnreadCount: number;
	chatOpen: boolean;
	setChatOpen: (open: boolean) => void;
	/**
	 * Rooms the user is currently viewing. Empty means none are open, one
	 * renders a single chat, more than one renders the split view. The first room
	 * is the primary one (shown on top / given the larger share in split view).
	 */
	activeRoomIds: number[];
	setActiveRoomIds: (roomIds: number[]) => void;
	/** Role labels (e.g. "TO", "Caster") shown next to non-participant authors, keyed by user id. */
	chatLabels: Record<number, string>;
	setChatLabels: (labels: Record<number, string>) => void;
	clearChatLabels: () => void;
}
