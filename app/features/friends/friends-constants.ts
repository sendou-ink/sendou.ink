export const FRIEND = {
	MAX_PENDING_REQUESTS: 20,
	PENDING_REQUEST_EXPIRES_IN_MONTHS: 1,
} as const;

export const SENDOUQ_ACTIVITY_LABEL = "SendouQ";

export type FriendActivityType =
	| "SENDOUQ_MATCH"
	| "TOURNAMENT_MATCH"
	| "TOURNAMENT_PLAYING"
	| "SENDOUQ"
	| "TOURNAMENT_SUB";

/**
 * Whether the activity represents a friend currently playing (in a live match
 * or otherwise busy in a running tournament) as opposed to looking for members.
 */
export function isLiveFriendActivity(type: FriendActivityType | null) {
	return (
		type === "SENDOUQ_MATCH" ||
		type === "TOURNAMENT_MATCH" ||
		type === "TOURNAMENT_PLAYING"
	);
}

/**
 * Sort value used to order friends by how interesting their activity is.
 * Looking for members ranks highest (others can act on it), then live activity,
 * then no activity.
 */
export function friendActivitySortValue(type: FriendActivityType | null) {
	if (type === "SENDOUQ") return 4;
	if (type === "TOURNAMENT_SUB") return 3;
	if (isLiveFriendActivity(type)) return 2;
	return 0;
}
