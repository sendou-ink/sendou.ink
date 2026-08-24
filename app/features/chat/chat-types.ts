import type { Tables } from "~/db/tables";

export type ChatRoomType =
	| "SQ_GROUP"
	| "SQ_MATCH"
	| "TOURNAMENT_MATCH"
	| "TOURNAMENT_TEAM"
	| "SCRIM";

export type SystemMessageType =
	| "NEW_GROUP"
	| "USER_LEFT"
	| "MATCH_STARTED"
	| "READY_CHECK_STARTED"
	| "LIKE_RECEIVED"
	| "SCORE_REPORTED"
	| "SCORE_CONFIRMED"
	| "CANCEL_REPORTED"
	| "CANCEL_CONFIRMED"
	| "CANCEL_REFUSED"
	| "MAP_REPLAYED"
	| "MAP_PICKED";

export type PersistedSystemMessageType = Extract<
	SystemMessageType,
	| "SCORE_REPORTED"
	| "SCORE_CONFIRMED"
	| "CANCEL_REPORTED"
	| "CANCEL_CONFIRMED"
	| "CANCEL_REFUSED"
	| "USER_LEFT"
	| "MAP_REPLAYED"
	| "MAP_PICKED"
>;

export type SoundOnlySystemMessageType = Extract<
	SystemMessageType,
	"NEW_GROUP" | "MATCH_STARTED" | "READY_CHECK_STARTED" | "LIKE_RECEIVED"
>;

// xxx: extend CommonUser
export interface ChatMessageAuthor {
	id: number;
	username: string;
	discordId: string;
	discordAvatar: string | null;
	customUrl: string | null;
	customAvatarUrl: string | null;
	pronouns: Tables["User"]["pronouns"];
	chatNameHue: string | null;
}

export interface ChatMessageWithAuthor {
	id: number;
	roomId: number;
	authorUserId: number | null;
	type: PersistedSystemMessageType | null;
	contents: string | null;
	publicId: string;
	/** databaseTimestamp */
	createdAt: number;
	author: ChatMessageAuthor | null;
}

/** A message as held client-side: a persisted row, or an optimistic send awaiting its echo. */
export interface ClientChatMessage extends ChatMessageWithAuthor {
	pending?: boolean;
}

/** One room of the user's room list as served by `GET /api/chat/rooms`. */
export interface ChatRoomListItem {
	id: number;
	type: ChatRoomType;
	/** Interpolation values for the client-localized room title, keyed per room type. */
	titleParams: Record<string, string>;
	url: string;
	imageUrl: string | null;
	participantUserIds: number[];
	/** databaseTimestamp */
	expiresAt: number;
	/** Whether the owner's activity has concluded (e.g. the match was finalized). */
	inactive: boolean;
	unreadCount: number;
	latestMessageId: number | null;
	/** databaseTimestamp */
	latestMessageAt: number | null;
}

export type RevalidateScope = "MATCH_RESULTS";
