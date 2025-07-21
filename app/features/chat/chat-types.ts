export type SystemMessageType =
	| "NEW_GROUP"
	| "USER_LEFT"
	| "MATCH_STARTED"
	| "LIKE_RECEIVED"
	| "SCORE_REPORTED"
	| "SCORE_CONFIRMED"
	| "CANCEL_REPORTED"
	| "CANCEL_CONFIRMED"
	| "TOURNAMENT_UPDATED"
	| "TOURNAMENT_MATCH_UPDATED";

export type SystemMessageContext = {
	name: string;
};
export interface ChatMessage {
	id: string;
	type?: SystemMessageType;
	contents?: string;
	context?: SystemMessageContext;
	/** If true, the purpose of this message is just to run the data loaders again meaning the logic related to showing a new chat message is skipped. Defaults to false.  */
	revalidateOnly?: boolean;
	userId?: number;
	timestamp: number;
	room: string;
	pending?: boolean;
}
