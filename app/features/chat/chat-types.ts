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
	| "TOURNAMENT_UPDATED"
	| "TOURNAMENT_MATCH_UPDATED"
	| "MAP_REPLAYED"
	| "MAP_PICKED";

export type SystemMessageContext = {
	name: string;
};

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

export interface ChatMessageWithAuthor {
	id: number;
	roomId: number;
	authorUserId: number | null;
	type: PersistedSystemMessageType | null;
	contents: string | null;
	publicId: string;
	createdAt: number;
	author: ChatUser | null;
}

export type RevalidateScope = "MATCH_RESULTS";
export interface ChatMessage {
	id: string;
	type?: SystemMessageType;
	contents?: string;
	context?: SystemMessageContext;
	/** If true, the purpose of this message is just to run the data loaders again meaning the logic related to showing a new chat message is skipped. Defaults to false.  */
	revalidateOnly?: boolean;
	/** Narrows what data a `revalidateOnly` message may have changed so that routes whose data is unaffected can skip revalidating. Unset means anything may have changed. */
	revalidateScope?: RevalidateScope;
	/** User id of the actor that triggered this message. Used to skip own-author revalidates so we don't double-fetch loaders right after a form submission. */
	authorUserId?: number;
	userId?: number;
	timestamp: number;
	room: string;
	pending?: boolean;
}

export type ChatUser = Pick<
	Tables["User"],
	"username" | "discordId" | "discordAvatar" | "pronouns"
> & {
	customAvatarUrl: string | null;
	chatNameHue: string | null;
	title?: string;
};

export interface ChatProps {
	users: Record<number, ChatUser>;
	rooms: { label: string; code: string }[];
	className?: string;
	messagesContainerClassName?: string;
	hidden?: boolean;
	disabled?: boolean;
	missingUserName?: string;
}
