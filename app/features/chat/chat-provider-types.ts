import type { ChatMessage, ChatUser } from "./chat-types";

/** Metadata stored per room on the Skalop server */
export interface RoomMetadata {
	participantUserIds: number[];
	chatUsers: Record<number, ChatUser>;
	expiresAt: number;
	header: string;
	subtitle?: string;
	url?: string;
	imageUrl?: string;
	createdAt?: number;
}

/** Room info as returned by Skalop on connect and ROOM_JOINED events */
export interface ServerRoomInfo {
	chatCode: string;
	metadata: RoomMetadata;
	lastMessageTimestamp: number | null;
	totalMessageCount: number;
}

/** Flattened room info used by the UI */
export interface RoomInfo {
	chatCode: string;
	header: string;
	subtitle: string;
	url: string;
	imageUrl: string;
	participantUserIds: number[];
	expiresAt: number;
	lastMessageTimestamp: number;
	totalMessageCount: number;
	createdAt: number;
	isObsolete?: boolean;
}

export interface ChatContextValue {
	isLoading: boolean;
	rooms: RoomInfo[];
	messagesForRoom: (chatCode: string) => ChatMessage[];
	send: (chatCode: string, contents: string) => void;
	subscribe: (chatCode: string) => void;
	unsubscribe: (chatCode: string) => void;
	subscribeTopic: (topic: string) => void;
	unsubscribeTopic: (topic: string) => void;
	requestHistory: (chatCode: string) => void;
	markAsRead: (chatCode: string) => void;
	unreadCounts: Record<string, number>;
	totalUnreadCount: number;
	readyState: "CONNECTING" | "CONNECTED" | "CLOSED";
	chatUsers: Record<number, ChatUser>;
	chatOpen: boolean;
	setChatOpen: (open: boolean) => void;
	/**
	 * Chat codes the user is currently viewing. Empty means none are open, one
	 * renders a single chat, more than one renders the split view. The first code
	 * is the primary room (shown on top / given the larger share in split view).
	 */
	activeRooms: string[];
	setActiveRooms: (chatCodes: string[]) => void;
	chatLabels: Record<number, string>;
	setChatLabels: (labels: Record<number, string>) => void;
	clearChatLabels: () => void;
}
