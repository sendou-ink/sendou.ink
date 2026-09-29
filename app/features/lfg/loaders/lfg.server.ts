import type { LoaderFunctionArgs } from "react-router";
import * as Seasons from "~/features/mmr/core/Seasons";
import type { TierName } from "~/features/mmr/mmr-constants";
import { compareTwoTiers } from "~/features/mmr/mmr-utils";
import { userSkills } from "~/features/mmr/tiered.server";
import { getViewerTimezone } from "~/features/timezone/timezone-context.server";
import { paginate } from "~/utils/remix.server";
import * as LFGRepository from "../LFGRepository.server";
import { LFG } from "../lfg-constants";
import { lfgSearchParams } from "../lfg-search-params";
import type { LFGFilterValues } from "../lfg-types";

export const loader = async ({ request, url }: LoaderFunctionArgs) => {
	const { page, post, ...filters } = lfgSearchParams.parse(request);

	const viewerTimezone = getViewerTimezone();

	// xxx: how sqlite?
	const [maxTierUserIds, minTierUserIds] = await Promise.all([
		usersInTierRange({ maxTier: filters.maxTier }),
		usersInTierRange({ minTier: filters.minTier }),
	]);

	const board = await boardPosts({
		filters,
		viewerTimezone,
		maxTierUserIds,
		minTierUserIds,
	}).paginate({ page, size: LFG.POSTS_PER_PAGE, containing: post });

	const pagination = paginate({
		url,
		page: board.currentPage,
		pageSize: LFG.POSTS_PER_PAGE,
		totalCount: board.totalCount,
	});

	return {
		posts: board.items,
		viewerTimezone,
		...pagination,
	};
};

function boardPosts({
	filters,
	viewerTimezone,
	maxTierUserIds,
	minTierUserIds,
}: {
	filters: LFGFilterValues;
	viewerTimezone: string | null;
	maxTierUserIds: number[] | null;
	minTierUserIds: number[] | null;
}) {
	return LFGRepository.posts()
		.visibleToActor()
		.withAuthor()
		.withTeam()
		.boardOrder()
		.where({ type: filters.type ?? undefined })
		.withParticipantPlaying(filters.weapons)
		.withParticipantInPlusTier(filters.plusTier)
		.withParticipantAmong(maxTierUserIds)
		.withParticipantAmong(minTierUserIds)
		.inLanguage(filters.language)
		.inTimezoneWithin(filters.timezone, viewerTimezone);
}

/** Users whose accurate tier this or last season is inside the range, `null` when the range is open on both ends. */
async function usersInTierRange({
	minTier = null,
	maxTier = null,
}: {
	minTier?: TierName | null;
	maxTier?: TierName | null;
}) {
	if (minTier === null && maxTier === null) return null;

	const latestSeason = Seasons.currentOrPrevious()!.nth;
	const seasonsSkills = await Promise.all(
		[latestSeason, latestSeason - 1].map(async (season) =>
			Object.entries((await userSkills(season)).userSkills),
		),
	);

	const userIds = new Set<number>();
	for (const [userId, skill] of seasonsSkills.flat()) {
		if (skill.approximate) continue;
		if (maxTier !== null && compareTwoTiers(skill.tier.name, maxTier) < 0) {
			continue;
		}
		if (minTier !== null && compareTwoTiers(skill.tier.name, minTier) > 0) {
			continue;
		}

		userIds.add(Number(userId));
	}

	return [...userIds];
}
