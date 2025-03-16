export type SystemMessageType =
	| "NEW_GROUP"
	| "USER_LEFT"
	| "MATCH_STARTED"
	| "LIKE_RECEIVED"
	| "SCORE_REPORTED"
	| "SCORE_CONFIRMED"
	| "CANCEL_REPORTED"
	| "CANCEL_CONFIRMED";

export type SystemMessageContext = {
	name: string;
};
export interface ChatMessage {
	id: string;
	type?: SystemMessageType;
	contents?: string;
	context?: SystemMessageContext;
	revalidateOnly?: boolean;
	userId?: number;
	timestamp: number;
	room: string;
	pending?: boolean;
}
