import { compareTwoTiers } from "~/features/mmr/mmr-utils";
import type { MainWeaponId } from "~/modules/in-game-lists/types";
import {
	mainWeaponIds,
	weaponIdToBaseWeaponId,
} from "~/modules/in-game-lists/weapon-ids";
import type { LFGFiltersState } from "../lfg-types";
import type { LFGLoaderData, LFGLoaderPost, TiersMap } from "../routes/lfg";
import { hourDifferenceBetweenTimezones } from "./timezone";

export function filterPosts(
	posts: LFGLoaderData["posts"],
	filters: LFGFiltersState,
	tiersMap: TiersMap,
) {
	return posts.filter((post) => {
		if (!matchesTypeFilter(post, filters.type)) return false;
		if (!matchesWeaponFilter(post, filters.weapon)) return false;
		if (!matchesTimezoneFilter(post, filters.timezone)) return false;
		if (!matchesLanguageFilter(post, filters.language)) return false;
		if (!matchesPlusTierFilter(post, filters.plusTier)) return false;
		if (!matchesMinTierFilter(post, filters.minTier, tiersMap)) return false;
		if (!matchesMaxTierFilter(post, filters.maxTier, tiersMap)) return false;

		return true;
	});
}

function matchesTypeFilter(post: LFGLoaderPost, type: LFGFiltersState["type"]) {
	if (type === null) return true;
	return post.type === type;
}

function matchesWeaponFilter(
	post: LFGLoaderPost,
	weapon: LFGFiltersState["weapon"],
) {
	if (weapon.length === 0) return true;
	if (post.type === "COACH_FOR_TEAM") return true;

	const weaponIdsWithRelated = weapon.flatMap(weaponIdToRelated);

	return checkMatchesSomeUserInPost(post, (user) =>
		user.weaponPool.some(({ weaponSplId }) =>
			weaponIdsWithRelated.includes(weaponSplId),
		),
	);
}

function matchesTimezoneFilter(
	post: LFGLoaderPost,
	timezone: LFGFiltersState["timezone"],
) {
	if (timezone === null) return true;

	const userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

	return (
		Math.abs(hourDifferenceBetweenTimezones(post.timezone, userTimezone)) <=
		timezone
	);
}

function matchesLanguageFilter(
	post: LFGLoaderPost,
	language: LFGFiltersState["language"],
) {
	if (language === null) return true;
	return !!post.languages?.includes(language);
}

function matchesPlusTierFilter(
	post: LFGLoaderPost,
	plusTier: LFGFiltersState["plusTier"],
) {
	if (plusTier === null) return true;

	return checkMatchesSomeUserInPost(
		post,
		(user) => user.plusTier !== null && user.plusTier <= plusTier,
	);
}

function matchesMinTierFilter(
	post: LFGLoaderPost,
	minTier: LFGFiltersState["minTier"],
	tiersMap: TiersMap,
) {
	if (minTier === null) return true;
	if (post.type === "COACH_FOR_TEAM") return true;

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

function matchesMaxTierFilter(
	post: LFGLoaderPost,
	maxTier: LFGFiltersState["maxTier"],
	tiersMap: TiersMap,
) {
	if (maxTier === null) return true;
	if (post.type === "COACH_FOR_TEAM") return true;

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
