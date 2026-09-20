export const FRIEND = {
	MAX_PENDING_REQUESTS: 20,
	PENDING_REQUEST_EXPIRES_IN_MONTHS: 1,
} as const;

export const SENDOUQ_ACTIVITY_LABEL = "SendouQ";

export type FriendActivityType =
	| "SENDOUQ_MATCH"
	| "TOURNAMENT_MATCH"
	| "TOURNAMENT_WAITING"
	| "SENDOUQ"
	| "TOURNAMENT_SUB";

export type FriendActivityBadge = "MATCH" | "NEXT";

const ACTIVITY_BADGE: Record<FriendActivityType, FriendActivityBadge | null> = {
	SENDOUQ_MATCH: "MATCH",
	TOURNAMENT_MATCH: "MATCH",
	TOURNAMENT_WAITING: "NEXT",
	SENDOUQ: null,
	TOURNAMENT_SUB: null,
};

export function friendActivityBadge(type: FriendActivityType | null) {
	if (!type) return null;

	return ACTIVITY_BADGE[type];
}

export function isInProgressFriendActivity(type: FriendActivityType | null) {
	return friendActivityBadge(type) !== null;
}

export function friendActivitySortValue(type: FriendActivityType | null) {
	if (type === "SENDOUQ") return 4;
	if (type === "TOURNAMENT_SUB") return 3;
	if (isInProgressFriendActivity(type)) return 2;
	return 0;
}

/** Section of the friends list, pinned friends with activity at the top and idle unpinned ones at the bottom. Lower sorts first. */
export function friendSectionSortValue({
	isPinned,
	activityType,
}: {
	isPinned: boolean;
	activityType: FriendActivityType | null;
}) {
	const hasActivity = activityType !== null;

	if (isPinned && hasActivity) return 0;
	if (hasActivity) return 1;
	if (isPinned) return 2;
	return 3;
}
