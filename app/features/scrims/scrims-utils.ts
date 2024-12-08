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
				return !isOwnRequest;
			}),
		};
	};
