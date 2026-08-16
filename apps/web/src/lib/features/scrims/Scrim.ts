import type { LutiDiv, ScrimPost } from "./scrims-types.ts";

/** Returns true if the original poster has accepted any of the requests. */
export function isAccepted(post: ScrimPost) {
	return post.requests.some((request) => request.isAccepted);
}

/** Returns true if the user is participating in the scrim, either in the original post users list or the request. */
export function isParticipating(post: ScrimPost, userId: number) {
	return (
		post.requests.some((request) =>
			request.users.some((user) => user.id === userId),
		) || post.users.some((user) => user.id === userId)
	);
}

/**
 * Returns the actual start time of the scrim.
 * When the post has a time range (rangeEndsAt is set), returns the accepted request's specific time if available.
 * Otherwise returns the post's start time.
 */
export function getStartTime(post: ScrimPost): number {
	const acceptedRequest = post.requests.find((r) => r.isAccepted);
	return acceptedRequest?.startsAt ?? post.startsAt;
}

/** Converts a `ScrimPost.maxDiv`/`minDiv` database value into its LUTI div label. */
export const parseLutiDiv = (div: number): LutiDiv => {
	if (div === 0) return "X";

	return String(div) as LutiDiv;
};
