import type { LoaderFunctionArgs } from "react-router";
import * as R from "remeda";
import { getUser } from "~/features/auth/core/user.server";
import * as Seasons from "~/features/mmr/core/Seasons";
import { userSkills } from "~/features/mmr/tiered.server";
import { getViewerTimezone } from "~/features/timezone/timezone-context.server";
import * as UserCardRepository from "~/features/user-card/UserCardRepository.server";
import { paginate } from "~/utils/remix.server";
import type { Unpacked } from "~/utils/types";
import { filterPosts, type TiersMap } from "../core/filtering";
import * as LFGRepository from "../LFGRepository.server";
import { LFG } from "../lfg-constants";
import { lfgSearchParams } from "../lfg-search-params";

export const loader = async ({ request, url }: LoaderFunctionArgs) => {
	const user = getUser();
	const { page, post, ...filters } = lfgSearchParams.parse(request);

	const viewerTimezone = getViewerTimezone();

	const allPosts = await LFGRepository.findAllPosts(user);
	const filteredPosts = filterPosts(allPosts, filters, {
		tiersMap: await postsUsersTiersMap(allPosts),
		viewerTimezone,
	});

	const postIndex =
		post !== null
			? filteredPosts.findIndex((filteredPost) => filteredPost.id === post)
			: -1;
	const pageContainingPost =
		postIndex === -1 ? null : Math.floor(postIndex / LFG.POSTS_PER_PAGE) + 1;

	const pagination = paginate({
		url,
		page: pageContainingPost ?? page,
		pageSize: LFG.POSTS_PER_PAGE,
		totalCount: filteredPosts.length,
	});

	const posts = filteredPosts.slice(
		(pagination.currentPage - 1) * LFG.POSTS_PER_PAGE,
		pagination.currentPage * LFG.POSTS_PER_PAGE,
	);

	const cardUserIds = R.unique(
		posts.flatMap((post) => [
			post.author.id,
			...(post.team?.members ?? []).map((member) => member.id),
		]),
	);

	return {
		posts,
		viewerTimezone,
		...(await UserCardRepository.findAllByUserIdsCached({
			userIds: cardUserIds,
		})),
		...pagination,
	};
};

async function postsUsersTiersMap(
	posts: Unpacked<ReturnType<typeof LFGRepository.findAllPosts>>,
): Promise<TiersMap> {
	const latestSeason = Seasons.currentOrPrevious()!.nth;
	const previousSeason = latestSeason - 1;

	const [
		{ userSkills: latestSeasonSkills },
		{ userSkills: previousSeasonSkills },
	] = await Promise.all([userSkills(latestSeason), userSkills(previousSeason)]);

	const uniqueUsers = new Set<number>();
	for (const post of posts) {
		uniqueUsers.add(post.author.id);

		for (const user of post.team?.members ?? []) {
			uniqueUsers.add(user.id);
		}
	}

	const userSkillsMap: TiersMap = new Map();

	for (const userId of uniqueUsers) {
		const tiers = {
			latest:
				latestSeasonSkills[userId] && !latestSeasonSkills[userId].approximate
					? latestSeasonSkills[userId].tier
					: undefined,
			previous:
				previousSeasonSkills[userId] &&
				!previousSeasonSkills[userId].approximate
					? previousSeasonSkills[userId].tier
					: undefined,
		};

		if (tiers.latest || tiers.previous) {
			userSkillsMap.set(userId, tiers);
		}
	}

	return userSkillsMap;
}
