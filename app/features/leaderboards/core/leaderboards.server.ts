import { cachified } from "@epic-web/cachified";
import { HALF_HOUR_IN_MS } from "~/constants";
import { USER_LEADERBOARD_MIN_ENTRIES_FOR_LEVIATHAN } from "~/features/mmr/mmr-constants";
import { spToOrdinal } from "~/features/mmr/mmr-utils";
import { currentOrPreviousSeason, currentSeason } from "~/features/mmr/season";
import { freshUserSkills, userSkills } from "~/features/mmr/tiered.server";
import type { MainWeaponId } from "~/modules/in-game-lists";
import { weaponCategories } from "~/modules/in-game-lists";
import { cache, ttl } from "~/utils/cache.server";
import type { Unwrapped } from "~/utils/types";
import { DEFAULT_LEADERBOARD_MAX_SIZE } from "../leaderboards-constants";
import { seasonHasTopTen } from "../leaderboards-utils";
import type { SeasonPopularUsersWeapon } from "../queries/seasonPopularUsersWeapon.server";
import { seasonPopularUsersWeapon } from "../queries/seasonPopularUsersWeapon.server";
import type { UserSPLeaderboardItem } from "../queries/userSPLeaderboard.server";
import { userSPLeaderboard } from "../queries/userSPLeaderboard.server";

export type UserLeaderboardWithAdditionsItem = Unwrapped<
	typeof cachedFullUserLeaderboard
>;
export async function cachedFullUserLeaderboard(season: number) {
	return cachified({
		key: `user-leaderboard-season-${season}`,
		cache,
		ttl: ttl(HALF_HOUR_IN_MS),
		async getFreshValue() {
			const leaderboard = userSPLeaderboard(season);
			const withTiers = addTiers(leaderboard, season);

			const shouldAddPendingPlusTier =
				season === currentSeason(new Date())?.nth &&
				leaderboard.length >= USER_LEADERBOARD_MIN_ENTRIES_FOR_LEVIATHAN;
			const withPendingPlusTiers = shouldAddPendingPlusTier
				? addPendingPlusTiers(withTiers)
				: withTiers;

			return addWeapons(withPendingPlusTiers, seasonPopularUsersWeapon(season));
		},
	});
}

function addTiers(entries: UserSPLeaderboardItem[], season: number) {
	const tiers = freshUserSkills(season);

	const encounteredTiers = new Set<string>();
	return entries.map((entry, i) => {
		const tier = tiers.userSkills[entry.id].tier;
		if (i < 10 && seasonHasTopTen(season)) {
			return { ...entry, tier, firstOfTier: undefined };
		}

		const tierKey = `${tier.name}${tier.isPlus ? "+" : ""}`;
		const tierAlreadyEncountered = encounteredTiers.has(tierKey);
		if (!tierAlreadyEncountered) {
			encounteredTiers.add(tierKey);
		}

		return {
			...entry,
			tier,
			firstOfTier: !tierAlreadyEncountered ? tier : undefined,
		};
	});
}

const PLUS_TIER_QUOTA = {
	"+1": 10,
	"+2": 20,
	"+3": 30,
} as const;
export function addPendingPlusTiers<T extends UserSPLeaderboardItem>(
	entries: T[],
) {
	const quota: { "+1": number; "+2": number; "+3": number } = {
		...PLUS_TIER_QUOTA,
	};

	const resolveHighestPlusTierWithSpace = () => {
		if (quota["+1"] > 0) return 1;
		if (quota["+2"] > 0) return 2;
		if (quota["+3"] > 0) return 3;

		return null;
	};

	for (const entry of entries) {
		const highestPlusTierWithSpace = resolveHighestPlusTierWithSpace();
		if (!highestPlusTierWithSpace) break;

		if (entry.plusTier && entry.plusTier <= highestPlusTierWithSpace) continue;
		if (
			entry.plusSkippedForSeasonNth === currentOrPreviousSeason(new Date())?.nth
		) {
			entry.plusSkippedForSeasonNth = null;
			continue;
		}

		entry.pendingPlusTier = highestPlusTierWithSpace;
		const key = `+${highestPlusTierWithSpace}` as const;
		quota[key] -= 1;
	}

	return entries;
}

function addWeapons<T extends { id: number }>(
	entries: T[],
	weapons: SeasonPopularUsersWeapon,
) {
	return entries.map((entry) => {
		const weaponSplId = weapons[entry.id] as MainWeaponId | undefined;
		return {
			...entry,
			weaponSplId,
		};
	});
}

export function filterByWeaponCategory<
	T extends { weaponSplId?: MainWeaponId },
>(entries: Array<T>, category: (typeof weaponCategories)[number]["name"]) {
	const weaponIdsOfCategory = new Set(
		weaponCategories.find((c) => c.name === category)!.weaponIds,
	);

	return entries.filter(
		(entry) => entry.weaponSplId && weaponIdsOfCategory.has(entry.weaponSplId),
	);
}

export function addPlacementRank<T>(entries: T[]) {
	return entries.map((entry, index) => ({
		...entry,
		placementRank: index + 1,
	}));
}

export function ownEntryPeek({
	leaderboard,
	userId,
	season,
}: {
	leaderboard: UserSPLeaderboardItem[];
	userId: number;
	season: number;
}) {
	const found = leaderboard.find(
		(entry) =>
			entry.id === userId && entry.placementRank > DEFAULT_LEADERBOARD_MAX_SIZE,
	);

	if (!found) return null;

	const withTier = addTiers([found], season)[0];

	const { intervals } = userSkills(season);

	return {
		entry: withTier,
		nextTier: intervals
			.slice()
			.reverse()
			.find(
				(tier) =>
					tier.neededOrdinal &&
					tier.neededOrdinal > spToOrdinal(withTier.power),
			),
	};
}
