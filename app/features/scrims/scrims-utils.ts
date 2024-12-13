import type { ScrimPost } from "./scrims-types";

// xxx: rename?
export const getPostRequestCensor =
	(userId: number) =>
	(post: ScrimPost): ScrimPost => {
		return {
			...post,
			requests: post.requests.filter((request) => {
				const isOwnPost = post.users.some((user) => user.id === userId);
				if (isOwnPost) {
					return true;
				}

				// xxx: should be able to delete request if just the member of it? not author
				const isOwnRequest = request.users.some((user) => user.id === userId);
				return isOwnRequest;
			}),
		};
	};

export function dividePosts(posts: Array<ScrimPost>, userId?: number) {
	const grouped = Object.groupBy(posts, (post) => {
		if (post.users.some((user) => user.id === userId)) {
			return "OWNED";
		}

		if (
			post.requests.some((request) =>
				request.users.some((user) => user.id === userId),
			)
		) {
			return "REQUESTED";
		}

		return "NEUTRAL";
	});

	return {
		owned: grouped.OWNED ?? [],
		requested: grouped.REQUESTED ?? [],
		neutral: grouped.NEUTRAL ?? [],
	};
}
