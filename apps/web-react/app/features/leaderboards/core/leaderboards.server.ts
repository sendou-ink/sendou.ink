import { cachified } from "@epic-web/cachified";
import type {
	SeasonPopularUsersWeapon,
	UserSPLeaderboardItem,
} from "~/features/leaderboards/LeaderboardRepository.server";
import * as LeaderboardRepository from "~/features/leaderboards/LeaderboardRepository.server";
import * as Seasons from "~/features/mmr/core/Seasons";
import { USER_LEADERBOARD_MIN_ENTRIES_FOR_LEVIATHAN } from "~/features/mmr/mmr-constants";
import { freshUserSkills } from "~/features/mmr/tiered.server";
import * as UserRepository from "~/features/user-page/UserRepository.server";
import type { MainWeaponId } from "~/modules/in-game-lists/types";
import { weaponCategories } from "~/modules/in-game-lists/weapon-ids";
import { cache, IN_MILLISECONDS, ttl } from "~/utils/cache.server";
import type { Unwrapped } from "~/utils/types";
import { DEFAULT_LEADERBOARD_MAX_SIZE } from "../leaderboards-constants";
import { seasonHasTopTen } from "../leaderboards-utils";

export type UserLeaderboardWithAdditionsItem = Unwrapped<
	typeof cachedFullUserLeaderboard
>;
export async function cachedFullUserLeaderboard(season: number) {
	return cachified({
		key: `user-leaderboard-season-${season}`,
		cache,
		ttl: ttl(IN_MILLISECONDS.HALF_HOUR),
		staleWhileRevalidate: ttl(IN_MILLISECONDS.TWO_HOURS),
		async getFreshValue() {
			const leaderboard =
				await LeaderboardRepository.findUserSPLeaderboard(season);
			const withTiers = await addTiers(leaderboard, season);

			const shouldAddPendingPlusTier =
				season === Seasons.current()?.nth &&
				leaderboard.length >= USER_LEADERBOARD_MIN_ENTRIES_FOR_LEVIATHAN;
			const withPendingPlusTiers = shouldAddPendingPlusTier
				? addPendingPlusTiers(
						withTiers,
						await UserRepository.findAllPlusServerMembers(),
						season,
					)
				: withTiers;

			return addWeapons(
				withPendingPlusTiers,
				await LeaderboardRepository.findSeasonPopularUsersWeapon(season),
			);
		},
	});
}

export async function cachedTeamLeaderboard({
	season,
	onlyOneEntryPerUser,
}: {
	season: number;
	onlyOneEntryPerUser: boolean;
}) {
	return cachified({
		key: teamLeaderboardCacheKey({ season, onlyOneEntryPerUser }),
		cache,
		ttl: ttl(IN_MILLISECONDS.HALF_HOUR),
		staleWhileRevalidate: ttl(IN_MILLISECONDS.TWO_HOURS),
		async getFreshValue() {
			return LeaderboardRepository.findTeamLeaderboardBySeason({
				season,
				onlyOneEntryPerUser,
			});
		},
	});
}

/** Clears both variants of a season's cached team leaderboard, so that a change to which teams are skipped shows without waiting for the cache to expire. */
export function clearCachedTeamLeaderboards(season: number) {
	for (const onlyOneEntryPerUser of [true, false]) {
		cache.delete(teamLeaderboardCacheKey({ season, onlyOneEntryPerUser }));
	}
}

function teamLeaderboardCacheKey({
	season,
	onlyOneEntryPerUser,
}: {
	season: number;
	onlyOneEntryPerUser: boolean;
}) {
	return `team-leaderboard-season-${season}-${onlyOneEntryPerUser ? "TEAM" : "TEAM-ALL"}`;
}

async function addTiers<T extends UserSPLeaderboardItem>(
	entries: T[],
	season: number,
) {
	const tiers = await freshUserSkills(season);

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
	"+1": 5,
	"+2": 10,
	"+3": 15,
} as const;
export function addPendingPlusTiers<T extends UserSPLeaderboardItem>(
	entries: T[],
	plusTiers: Array<{
		userId: number;
		plusTier: number;
	}>,
	seasonNth: number,
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

		const plusTier = plusTiers.find((t) => t.userId === entry.id)?.plusTier;

		if (plusTier && plusTier <= highestPlusTierWithSpace) continue;
		if (entry.plusSkippedForSeasonNth === seasonNth) {
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
		(entry) =>
			typeof entry.weaponSplId === "number" &&
			weaponIdsOfCategory.has(entry.weaponSplId),
	);
}

/**
 * The entries of the full user leaderboard that are visible on the leaderboard
 * page. Cut by placement rank instead of entry count so that players tied
 * across the cutoff are all shown; {@link ownEntryPeek} covers exactly the
 * entries this leaves out.
 */
export function shownUserLeaderboard(
	leaderboard: UserLeaderboardWithAdditionsItem[],
) {
	return leaderboard.filter(
		(entry) => entry.placementRank <= DEFAULT_LEADERBOARD_MAX_SIZE,
	);
}

export async function ownEntryPeek({
	leaderboard,
	userId,
	season,
}: {
	leaderboard: UserLeaderboardWithAdditionsItem[];
	userId: number;
	season: number;
}) {
	const found = leaderboard.find(
		(entry) =>
			entry.id === userId && entry.placementRank > DEFAULT_LEADERBOARD_MAX_SIZE,
	);

	if (!found) return null;

	const withTier = (await addTiers([found], season))[0];

	const { intervals } = await freshUserSkills(season);

	const currentTierIndex = intervals.findIndex(
		(interval) =>
			interval.name === withTier.tier.name &&
			interval.isPlus === withTier.tier.isPlus,
	);

	const nextTier =
		currentTierIndex > 0 ? intervals[currentTierIndex - 1] : undefined;

	return {
		entry: withTier,
		nextTier,
	};
}
