import type { Tables } from "~/db/tables";
import type { CommonUser } from "~/utils/kysely.server";
import type { UNTHROTTLED_SYSTEM_MESSAGE_TYPES } from "./chat-constants";

export type ChatRoomType =
	| "SQ_GROUP"
	| "SQ_MATCH"
	| "TOURNAMENT_MATCH"
	| "TOURNAMENT_TEAM"
	| "SCRIM";

export type SystemMessageType =
	| "USER_LEFT"
	| "MATCH_STARTED"
	| "READY_CHECK_STARTED"
	| "LIKE_RECEIVED"
	| "SCORE_REPORTED"
	| "SCORE_CONFIRMED"
	| "SCORE_DISPUTED"
	| "CANCEL_REPORTED"
	| "CANCEL_CONFIRMED"
	| "CANCEL_REFUSED"
	| "MAP_REPLAYED"
	| "MAP_PICKED"
	| "MAP_BANNED"
	| "MODE_PICKED"
	| "MODE_BANNED";

export type PersistedSystemMessageType = Extract<
	SystemMessageType,
	| "SCORE_REPORTED"
	| "SCORE_CONFIRMED"
	| "SCORE_DISPUTED"
	| "CANCEL_REPORTED"
	| "CANCEL_CONFIRMED"
	| "CANCEL_REFUSED"
	| "USER_LEFT"
	| "MAP_REPLAYED"
	| "MAP_PICKED"
	| "MAP_BANNED"
	| "MODE_PICKED"
	| "MODE_BANNED"
>;

export type UnthrottledSystemMessageType = Extract<
	SystemMessageType,
	(typeof UNTHROTTLED_SYSTEM_MESSAGE_TYPES)[number]
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

/** A room a route asks to surface to the viewer, resolved into a `RouteChatRoom` by `RouteChatRooms.resolve`. */
export interface RouteChatRoomInput {
	roomId: number;
	/** Whether the room opens for the viewer on arrival, rather than only being listed in the sidebar (staff reading a private group chat). */
	autoOpen: boolean;
	/** Names the room in the sidebar, where its own title can't tell it apart (the two group chats of one match). */
	label?: string;
}

/** A room the current route surfaces to the viewer, from its loader's `chatRooms`, arriving with everything the chat opens with. */
export interface RouteChatRoom extends Omit<RouteChatRoomInput, "roomId"> {
	room: ChatRoomListItem;
	/** Latest messages oldest first; `null` for a room only listed, whose history is fetched when opened. */
	messages: ChatMessageWithAuthor[] | null;
}

export type RevalidateScope = "MATCH_RESULTS";
