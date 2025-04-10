import type { ScrimPost } from "../scrims-types";

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

export function resolvePoolCode(postId: number) {
	return `SC${postId % 10}`;
}
