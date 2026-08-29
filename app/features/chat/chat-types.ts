import type { Tables } from "~/db/tables";
import type { CommonUser } from "~/utils/kysely.server";
import type { SOUND_BY_SYSTEM_MESSAGE_TYPE } from "./chat-constants";

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
	keyof typeof SOUND_BY_SYSTEM_MESSAGE_TYPE
>;

export interface ChatMessageAuthor extends CommonUser {
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
	/** Role labels (e.g. "TO", "Stream") shown next to non-participant authors, keyed by user id. */
	labelByUserId: Record<number, string>;
	/** databaseTimestamp */
	expiresAt: number;
	/** Whether the owner's activity has concluded (e.g. the match was finalized). */
	inactive: boolean;
	/** Whether the viewer may post: false for an observer reading a private room, and once the room has expired or closed. */
	canPost: boolean;
	unreadCount: number;
	latestMessageId: number | null;
	/** databaseTimestamp */
	latestMessageAt: number | null;
}

/** A room the current route surfaces to the viewer, from its loader's `chatRooms`. */
export interface RouteChatRoom {
	roomId: number;
	/** Whether the room opens for the viewer on arrival, rather than only being listed in the sidebar (staff reading a private group chat). */
	autoOpen: boolean;
	/** Names the room in the sidebar, where its own title can't tell it apart (the two group chats of one match). */
	label?: string;
}

export type RevalidateScope = "MATCH_RESULTS";
