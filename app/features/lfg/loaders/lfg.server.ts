import type { LoaderFunctionArgs } from "react-router";
import * as R from "remeda";
import * as Seasons from "~/features/mmr/core/Seasons";
import type { TierName } from "~/features/mmr/mmr-constants";
import { compareTwoTiers } from "~/features/mmr/mmr-utils";
import { userSkills } from "~/features/mmr/tiered.server";
import { getViewerTimezone } from "~/features/timezone/timezone-context.server";
import * as UserCardRepository from "~/features/user-card/UserCardRepository.server";
import { paginate } from "~/utils/remix.server";
import { timezonesWithinHours } from "../core/timezone";
import { LFG } from "../lfg-constants";
import { lfgSearchParams } from "../lfg-search-params";
import * as LFGRepository from "../LFGRepository.server";

export const loader = async ({ request, url }: LoaderFunctionArgs) => {
	const { page, post, ...filters } = lfgSearchParams.parse(request);

	const viewerTimezone = getViewerTimezone();

	const board = await LFGRepository.findBoardPage({
		filters: {
			type: filters.type,
			weapons: filters.weapons,
			plusTier: filters.plusTier,
			language: filters.language,
			// nothing to compare against until the browser has reported its timezone
			timezones:
				filters.timezone !== null && viewerTimezone !== null
					? timezonesWithinHours(viewerTimezone, filters.timezone)
					: null,
			postIds: await postIdsWithParticipantInTierRange(filters),
		},
		page,
		pageSize: LFG.POSTS_PER_PAGE,
		containingPostId: post,
	});

	const pagination = paginate({
		url,
		page: board.currentPage,
		pageSize: LFG.POSTS_PER_PAGE,
		totalCount: board.totalCount,
	});

	const cardUserIds = R.unique(
		board.items.flatMap((eachPost) => [
			eachPost.author.id,
			...(eachPost.team?.members ?? []).map((member) => member.id),
		]),
	);

	return {
		posts: board.items,
		viewerTimezone,
		...(await UserCardRepository.findAllByUserIdsCached({
			userIds: cardUserIds,
		})),
		...pagination,
	};
};

/** Posts where some participant's accurate tier this or last season is at most `maxTier` and some participant's is at least `minTier`, `null` when the range is open on both ends. Coach posts never match. */
async function postIdsWithParticipantInTierRange({
	minTier,
	maxTier,
}: {
	minTier: TierName | null;
	maxTier: TierName | null;
}) {
	if (minTier === null && maxTier === null) return null;

	const latestSeason = Seasons.currentOrPrevious()!.nth;
	const [posts, latestSeasonSkills, previousSeasonSkills] = await Promise.all([
		LFGRepository.findAllVisibleParticipantIds(),
		userSkills(latestSeason),
		userSkills(latestSeason - 1),
	]);

	const someSeasonTier = (
		userId: number,
		matches: (tier: TierName) => boolean,
	) =>
		[latestSeasonSkills, previousSeasonSkills].some((season) => {
			const skill = season.userSkills[userId];

			return skill && !skill.approximate && matches(skill.tier.name);
		});
	const matchesMaxTier = (userId: number) =>
		maxTier === null ||
		someSeasonTier(userId, (tier) => compareTwoTiers(tier, maxTier) >= 0);
	const matchesMinTier = (userId: number) =>
		minTier === null ||
		someSeasonTier(userId, (tier) => compareTwoTiers(tier, minTier) <= 0);

	return posts
		.filter(
			(post) =>
				post.type !== "COACH_FOR_TEAM" &&
				post.participantIds.some(matchesMaxTier) &&
				post.participantIds.some(matchesMinTier),
		)
		.map((post) => post.id);
}
