import type { TierName } from "~/features/mmr/mmr-constants";
import { compareTwoTiers } from "~/features/mmr/mmr-utils";
import type { TieredSkill } from "~/features/mmr/tiered.server";
import type { MainWeaponId } from "~/modules/in-game-lists/types";
import {
	mainWeaponIds,
	weaponIdToBaseWeaponId,
} from "~/modules/in-game-lists/weapon-ids";
import type { Unpacked } from "~/utils/types";
import type * as LFGRepository from "../LFGRepository.server";
import type { LFGFilterValues } from "../lfg-types";
import { createTimezoneHourDifference } from "./timezone";

export type FilterablePost = Unpacked<
	Awaited<ReturnType<typeof LFGRepository.findAllPosts>>
>;

export type TiersMap = Map<
	number,
	{ latest?: TieredSkill["tier"]; previous?: TieredSkill["tier"] }
>;

export interface FilterContext {
	tiersMap: TiersMap;
	/** `null` when the viewer's timezone is unknown, which disables the timezone filter. */
	viewerTimezone: string | null;
}

interface PostFilterContext extends FilterContext {
	hourDifference: ReturnType<typeof createTimezoneHourDifference>;
}

export function filterPosts(
	posts: Array<FilterablePost>,
	filters: LFGFilterValues,
	context: FilterContext,
) {
	const hourDifference = createTimezoneHourDifference();

	return posts.filter((post) =>
		postMatchesFilters(post, filters, { ...context, hourDifference }),
	);
}

function postMatchesFilters(
	post: FilterablePost,
	filters: LFGFilterValues,
	context: PostFilterContext,
) {
	if (
		post.type === "COACH_FOR_TEAM" &&
		// not visible in the UI
		(filters.weapons.length > 0 ||
			filters.minTier !== null ||
			filters.maxTier !== null)
	) {
		return false;
	}

	if (filters.weapons.length > 0 && !matchesWeapons(post, filters.weapons)) {
		return false;
	}
	if (filters.type !== null && post.type !== filters.type) return false;
	if (
		filters.timezone !== null &&
		!matchesTimezone(post, filters.timezone, context)
	) {
		return false;
	}
	if (
		filters.language !== null &&
		!post.languages?.includes(filters.language)
	) {
		return false;
	}
	if (filters.plusTier !== null && !matchesPlusTier(post, filters.plusTier)) {
		return false;
	}
	if (
		filters.maxTier !== null &&
		!matchesMaxTier(post, filters.maxTier, context.tiersMap)
	) {
		return false;
	}
	if (
		filters.minTier !== null &&
		!matchesMinTier(post, filters.minTier, context.tiersMap)
	) {
		return false;
	}

	return true;
}

function matchesWeapons(post: FilterablePost, weapons: MainWeaponId[]) {
	const weaponIdsWithRelated = weapons.flatMap(weaponIdToRelated);

	return checkMatchesSomeUserInPost(post, (user) =>
		user.weaponPool.some(({ weaponSplId }) =>
			weaponIdsWithRelated.includes(weaponSplId),
		),
	);
}

function matchesTimezone(
	post: FilterablePost,
	maxHourDifference: number,
	{ viewerTimezone, hourDifference }: PostFilterContext,
) {
	// nothing to compare against until the browser has reported its timezone
	if (viewerTimezone === null) return true;

	return (
		Math.abs(hourDifference(post.timezone, viewerTimezone)) <= maxHourDifference
	);
}

function matchesPlusTier(post: FilterablePost, plusTier: number) {
	return checkMatchesSomeUserInPost(
		post,
		(user) => user.plusTier && user.plusTier <= plusTier,
	);
}

function matchesMaxTier(
	post: FilterablePost,
	maxTier: TierName,
	tiersMap: TiersMap,
) {
	return checkMatchesSomeUserInPost(post, (user) => {
		const tiers = tiersMap.get(user.id);
		if (!tiers) return false;

		if (tiers.latest && compareTwoTiers(tiers.latest.name, maxTier) >= 0) {
			return true;
		}

		if (tiers.previous && compareTwoTiers(tiers.previous.name, maxTier) >= 0) {
			return true;
		}

		return false;
	});
}

function matchesMinTier(
	post: FilterablePost,
	minTier: TierName,
	tiersMap: TiersMap,
) {
	return checkMatchesSomeUserInPost(post, (user) => {
		const tiers = tiersMap.get(user.id);
		if (!tiers) return false;

		if (tiers.latest && compareTwoTiers(tiers.latest.name, minTier) <= 0) {
			return true;
		}

		if (tiers.previous && compareTwoTiers(tiers.previous.name, minTier) <= 0) {
			return true;
		}

		return false;
	});
}

const checkMatchesSomeUserInPost = (
	post: FilterablePost,
	check: (user: FilterablePost["author"]) => boolean | undefined | null | 0,
) => {
	if (check(post.author)) return true;
	if (post.team?.members.some(check)) return true;
	return false;
};

const weaponIdToRelated = (weaponSplId: MainWeaponId) => {
	const result: MainWeaponId[] = [];

	for (const id of mainWeaponIds) {
		if (weaponIdToBaseWeaponId(id) === weaponIdToBaseWeaponId(weaponSplId)) {
			result.push(id);
		}
	}

	return result;
};
