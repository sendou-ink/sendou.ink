import { compareTwoTiers } from "~/features/mmr/mmr-utils";
import type { MainWeaponId } from "~/modules/in-game-lists";
import {
	altWeaponIdToId,
	mainWeaponIds,
	weaponIdToAltId,
} from "~/modules/in-game-lists/weapon-ids";
import { assertUnreachable } from "~/utils/types";
import type { LFGFilter } from "../lfg-types";
import type { LFGLoaderData, LFGLoaderPost, TiersMap } from "../routes/lfg";
import { hourDifferenceBetweenTimezones } from "./timezone";

export function filterPosts(
	posts: LFGLoaderData["posts"],
	filters: LFGFilter[],
	tiersMap: TiersMap,
) {
	return posts.filter((post) => {
		for (const filter of filters) {
			if (!filterMatchesPost(post, filter, tiersMap)) return false;
		}

		return true;
	});
}

function filterMatchesPost(
	post: LFGLoaderPost,
	filter: LFGFilter,
	tiersMap: TiersMap,
) {
	if (post.type === "COACH_FOR_TEAM") {
		// not visible in the UI
		if (
			filter._tag === "Weapon" ||
			filter._tag === "MaxTier" ||
			filter._tag === "MinTier"
		) {
			return false;
		}
	}

	switch (filter._tag) {
		case "Weapon": {
			if (filter.weaponSplIds.length === 0) return true;

			const weaponIdsWithRelated =
				filter.weaponSplIds.flatMap(weaponIdToRelated);

			return checkMatchesSomeUserInPost(post, (user) =>
				user.weaponPool.some(({ weaponSplId }) =>
					weaponIdsWithRelated.includes(weaponSplId),
				),
			);
		}
		case "Type":
			return post.type === filter.type;
		case "Timezone": {
			const userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

			return (
				Math.abs(hourDifferenceBetweenTimezones(post.timezone, userTimezone)) <=
				filter.maxHourDifference
			);
		}
		case "Language":
			return checkMatchesSomeUserInPost(post, (user) =>
				user.languages?.includes(filter.language),
			);
		case "PlusTier":
			return checkMatchesSomeUserInPost(
				post,
				(user) => user.plusTier && user.plusTier <= filter.tier,
			);
		case "MaxTier":
			return checkMatchesSomeUserInPost(post, (user) => {
				const tiers = tiersMap.get(user.id);
				if (!tiers) return false;

				if (
					tiers.latest &&
					compareTwoTiers(tiers.latest.name, filter.tier) >= 0
				) {
					return true;
				}

				if (
					tiers.previous &&
					compareTwoTiers(tiers.previous.name, filter.tier) >= 0
				) {
					return true;
				}

				return false;
			});
		case "MinTier":
			return checkMatchesSomeUserInPost(post, (user) => {
				const tiers = tiersMap.get(user.id);
				if (!tiers) return false;

				if (
					tiers.latest &&
					compareTwoTiers(tiers.latest.name, filter.tier) <= 0
				) {
					return true;
				}

				if (
					tiers.previous &&
					compareTwoTiers(tiers.previous.name, filter.tier) <= 0
				) {
					return true;
				}

				return false;
			});
		default:
			assertUnreachable(filter);
	}
}

const checkMatchesSomeUserInPost = (
	post: LFGLoaderPost,
	check: (user: LFGLoaderPost["author"]) => boolean | undefined | null | 0,
) => {
	if (check(post.author)) return true;
	if (post.team?.members.some(check)) return true;
	return false;
};

// TODO: could be written more clearly, fails in some edge cases like if "Hero Shot" was selected it won't find "Octo Shot"
const weaponIdToRelated = (weaponSplId: MainWeaponId) => {
	const idsSet = new Set<MainWeaponId>([weaponSplId]);

	const reg = altWeaponIdToId.get(weaponSplId);
	if (reg) {
		idsSet.add(reg);
	}

	const alt = weaponIdToAltId.get(weaponSplId);
	if (alt) {
		for (const id of Array.isArray(alt) ? alt : [alt]) {
			idsSet.add(id);
		}
	}

	const finalIdsSet = new Set<MainWeaponId>(idsSet);
	for (const id of idsSet) {
		// alt kits
		const maybeId1 = id - 1;
		const maybeId2 = id + 1;

		for (const maybeId of [maybeId1, maybeId2]) {
			if (mainWeaponIds.includes(maybeId as MainWeaponId)) {
				finalIdsSet.add(maybeId as MainWeaponId);
			}
		}
	}

	return Array.from(finalIdsSet);
};
