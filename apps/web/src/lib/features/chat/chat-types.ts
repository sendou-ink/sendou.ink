/**
 * System message types rendered inside a chat room. Grows as features that
 * post system messages migrate (sendouq & tournament add theirs later).
 */
export type ChatSystemMessageType = "MAP_PICKED" | "MAP_REPLAYED";

/** Extra interpolation values a system message carries, e.g. who acted. */
export interface ChatMessageContext {
	name: string;
}

export interface ChatMessage {
	id: number;
	/** Author; undefined for system messages */
	userId?: number;
	type?: ChatSystemMessageType;
	contents?: string;
	context?: ChatMessageContext;
	/** Unix timestamp (seconds) */
	createdAt: number;
}

export interface ChatUser {
	username: string;
	discordId: string;
	discordAvatar: string | null;
	customAvatarUrl?: string | null;
	chatNameHue?: number | null;
	title?: string;
}

export type ChatRoomLifecycle = "ACTIVE" | "INACTIVE" | "ARCHIVED";
