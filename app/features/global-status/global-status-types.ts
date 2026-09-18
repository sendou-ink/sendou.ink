export type GlobalStatusState =
	| "SQ_PREPARING"
	| "SQ_QUEUED"
	| "SQ_EXPIRED"
	| "SQ_READY_CHECK"
	| "SQ_MATCH"
	| "SQ_AWAITING_REPORT"
	| "TO_CHECKIN"
	| "TO_MATCH"
	| "TO_WAITING_FOR_MATCH"
	| "TO_WAITING_FOR_CAST";

export interface GlobalStatus {
	state: GlobalStatusState;
	/** Page the indicator links to e.g. the SendouQ match page. */
	url: string;
	/** Logo shown instead of the default state icon, e.g. the tournament's logo. */
	logoUrl?: string;
	/** Current SendouQ group fill shown after the state text, e.g. 2/4 members. */
	groupSize?: { members: number; max: number };
	/** Count shown as a badge e.g. likes received while in queue. */
	count?: number;
	/** Highlights the count badge when it calls for the user's attention. */
	countNeedsAction?: boolean;
	/** SendouQ group the queued status belongs to, scoping the likes seen tracking. */
	groupId?: number;
	/** When the queued group drops out of the looking pool, flipping the status to `SQ_EXPIRED`. */
	expiresAt?: number;
}
