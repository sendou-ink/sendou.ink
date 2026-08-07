import type { TierName } from "~/features/mmr/mmr-constants";
import { compareTwoTiers } from "~/features/mmr/mmr-utils";
import type { MainWeaponId } from "~/modules/in-game-lists/types";
import {
	mainWeaponIds,
	weaponIdToBaseWeaponId,
} from "~/modules/in-game-lists/weapon-ids";
import type { LFGFilterValues } from "../lfg-types";
import type { LFGLoaderData, LFGLoaderPost, TiersMap } from "../routes/lfg";
import { hourDifferenceBetweenTimezones } from "./timezone";

export function filterPosts(
	posts: LFGLoaderData["posts"],
	filters: LFGFilterValues,
	tiersMap: TiersMap,
) {
	return posts.filter((post) => postMatchesFilters(post, filters, tiersMap));
}

function postMatchesFilters(
	post: LFGLoaderPost,
	filters: LFGFilterValues,
	tiersMap: TiersMap,
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
	if (filters.timezone !== null && !matchesTimezone(post, filters.timezone)) {
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
		!matchesMaxTier(post, filters.maxTier, tiersMap)
	) {
		return false;
	}
	if (
		filters.minTier !== null &&
		!matchesMinTier(post, filters.minTier, tiersMap)
	) {
		return false;
	}

	return true;
}

function matchesWeapons(post: LFGLoaderPost, weapons: MainWeaponId[]) {
	const weaponIdsWithRelated = weapons.flatMap(weaponIdToRelated);

	return checkMatchesSomeUserInPost(post, (user) =>
		user.weaponPool.some(({ weaponSplId }) =>
			weaponIdsWithRelated.includes(weaponSplId),
		),
	);
}

function matchesTimezone(post: LFGLoaderPost, maxHourDifference: number) {
	const userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

	return (
		Math.abs(hourDifferenceBetweenTimezones(post.timezone, userTimezone)) <=
		maxHourDifference
	);
}

function matchesPlusTier(post: LFGLoaderPost, plusTier: number) {
	return checkMatchesSomeUserInPost(
		post,
		(user) => user.plusTier && user.plusTier <= plusTier,
	);
}

function matchesMaxTier(
	post: LFGLoaderPost,
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
	post: LFGLoaderPost,
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
	post: LFGLoaderPost,
	check: (user: LFGLoaderPost["author"]) => boolean | undefined | null | 0,
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
