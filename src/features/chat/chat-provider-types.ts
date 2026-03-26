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
	requestHistory: (chatCode: string) => void;
	markAsRead: (chatCode: string) => void;
	unreadCounts: Record<string, number>;
	totalUnreadCount: number;
	readyState: "CONNECTING" | "CONNECTED" | "CLOSED";
	chatUsers: Record<number, ChatUser>;
	chatOpen: boolean;
	setChatOpen: (open: boolean) => void;
	activeRoom: string | null;
	setActiveRoom: (chatCode: string | null) => void;
	chatLabels: Record<number, string>;
	setChatLabels: (labels: Record<number, string>) => void;
	clearChatLabels: () => void;
}
