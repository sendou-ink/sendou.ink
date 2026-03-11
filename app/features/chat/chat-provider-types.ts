import type { ChatMessage, ChatUser } from "./chat-types";

/** Metadata stored per room on the Skalop server */
export interface RoomMetadata {
	participantUserIds: number[];
	chatUsers: Record<number, ChatUser>;
	expiresAt: number;
	header: string;
	subtitle?: string;
	url?: string;
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
	participantUserIds: number[];
	expiresAt: number;
	lastMessageTimestamp: number;
	totalMessageCount: number;
}

export interface ChatContextValue {
	rooms: RoomInfo[];
	messagesForRoom: (chatCode: string) => ChatMessage[];
	send: (chatCode: string, contents: string) => void;
	subscribe: (chatCode: string) => void;
	unsubscribe: (chatCode: string) => void;
	requestHistory: (chatCode: string) => void;
	markAsRead: (chatCode: string) => void;
	unreadCounts: Record<string, number>;
	totalUnreadCount: number;
	readyState: "CONNECTING" | "CONNECTED" | "CLOSED";
	chatUsers: Record<number, ChatUser>;
	sidebarOpen: boolean;
	setSidebarOpen: (open: boolean) => void;
	activeRoom: string | null;
	setActiveRoom: (chatCode: string | null) => void;
}
