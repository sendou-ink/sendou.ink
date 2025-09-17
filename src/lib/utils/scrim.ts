import type { LutiDiv, ScrimPost } from '$lib/core/scrim/types';
import * as R from 'remeda';

export function getPostRequestCensor(userId: number) {
	return (post: ScrimPost): ScrimPost => {
		return {
			...post,
			requests: post.requests.filter((request) => {
				const isOwnPost = post.users.some((user) => user.id === userId);
				if (isOwnPost) {
					return true;
				}

				const isOwnRequest = request.users.some((user) => user.id === userId);
				return isOwnRequest;
			})
		};
	};
}

export function dividePosts(posts: Array<ScrimPost>, userId?: number) {
	const grouped = R.groupBy(posts, (post) => {
		if (post.users.some((user) => user.id === userId)) {
			return 'OWNED';
		}

		if (post.requests.some((request) => request.users.some((user) => user.id === userId))) {
			return 'REQUESTED';
		}

		return 'NEUTRAL';
	});

	return {
		owned: grouped.OWNED ?? [],
		requested: grouped.REQUESTED ?? [],
		neutral: grouped.NEUTRAL ?? []
	};
}

export function parseLutiDiv(div: number): LutiDiv {
	if (div === 0) return 'X';

	return String(div) as LutiDiv;
}

export function serializeLutiDiv(div: LutiDiv): number {
	if (div === 'X') return 0;

	return Number(div);
}
