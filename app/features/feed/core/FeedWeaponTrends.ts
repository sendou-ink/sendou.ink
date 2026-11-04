import * as R from "remeda";
import type { MainWeaponId } from "~/modules/in-game-lists/types";

/** How much the week's highest ranked player counts compared to its lowest ranked one */
const TOP_PLAYER_WEIGHT = 3;
const MIN_PLAYERS = 50;
/** Weapons below this share in both weeks are left out */
const MIN_SHARE = 0.02;
/** Smaller week-to-week moves are treated as noise */
const MIN_SHARE_CHANGE = 0.01;
const RISING_COUNT = 3;
const FALLING_COUNT = 2;

export interface WeaponPicks {
	userId: number;
	weaponSplId: MainWeaponId;
	count: number;
}

interface WeaponTrend {
	weaponSplId: MainWeaponId;
	sharePercentage: number;
	/** `null` when the weapon wasn't played at all last week */
	changePercentage: number | null;
}

/**
 * Weapons whose share of play rose and fell the most from last week to this week. Every player's weapon mix
 * counts once, weighted from 1 (lowest ranked or unranked) to `TOP_PLAYER_WEIGHT` (highest ranked) by their
 * ordinal among the week's players. `null` when either week has too few players or there is no clear riser and faller.
 */
export function risersAndFallers({
	thisWeek,
	lastWeek,
	ordinals,
}: {
	thisWeek: WeaponPicks[];
	lastWeek: WeaponPicks[];
	/** Skill ordinal by user id */
	ordinals: Map<number, number>;
}) {
	const playerCount = R.unique(thisWeek.map((picks) => picks.userId)).length;
	const previousPlayerCount = R.unique(
		lastWeek.map((picks) => picks.userId),
	).length;
	if (playerCount < MIN_PLAYERS || previousPlayerCount < MIN_PLAYERS) {
		return null;
	}

	const shares = weightedShares(thisWeek, ordinals);
	const previousShares = weightedShares(lastWeek, ordinals);

	const trends = R.unique([...shares.keys(), ...previousShares.keys()])
		.map((weaponSplId) => ({
			weaponSplId,
			share: shares.get(weaponSplId) ?? 0,
			previousShare: previousShares.get(weaponSplId) ?? 0,
		}))
		.filter(
			({ share, previousShare }) =>
				Math.max(share, previousShare) >= MIN_SHARE &&
				Math.abs(share - previousShare) >= MIN_SHARE_CHANGE,
		);

	const rising = R.sortBy(
		trends.filter(({ share, previousShare }) => share > previousShare),
		[
			({ share, previousShare }) =>
				previousShare === 0 ? Number.POSITIVE_INFINITY : share / previousShare,
			"desc",
		],
	).slice(0, RISING_COUNT);
	const falling = R.sortBy(
		trends.filter(({ share, previousShare }) => share < previousShare),
		({ share, previousShare }) => share / previousShare,
	).slice(0, FALLING_COUNT);
	if (rising.length === 0 || falling.length === 0) return null;

	return {
		rising: rising.map(toWeaponTrend),
		falling: falling.map(toWeaponTrend),
		playerCount,
	};
}

function weightedShares(picks: WeaponPicks[], ordinals: Map<number, number>) {
	const picksByUserId = Map.groupBy(picks, (pick) => pick.userId);
	const weights = rankWeights([...picksByUserId.keys()], ordinals);
	const totalWeight = R.sum([...weights.values()]);

	const result = new Map<MainWeaponId, number>();
	for (const [userId, userPicks] of picksByUserId) {
		const userPickCount = R.sumBy(userPicks, (pick) => pick.count);
		const userShare = weights.get(userId)! / totalWeight;

		for (const pick of userPicks) {
			result.set(
				pick.weaponSplId,
				(result.get(pick.weaponSplId) ?? 0) +
					(userShare * pick.count) / userPickCount,
			);
		}
	}

	return result;
}

function rankWeights(userIds: number[], ordinals: Map<number, number>) {
	const rankedLowestFirst = R.sortBy(
		userIds.filter((userId) => ordinals.has(userId)),
		(userId) => ordinals.get(userId)!,
	);
	const lastIndex = Math.max(rankedLowestFirst.length - 1, 1);

	const result = new Map(userIds.map((userId) => [userId, 1]));
	for (const [index, userId] of rankedLowestFirst.entries()) {
		result.set(userId, 1 + ((TOP_PLAYER_WEIGHT - 1) * index) / lastIndex);
	}

	return result;
}

function toWeaponTrend({
	weaponSplId,
	share,
	previousShare,
}: {
	weaponSplId: MainWeaponId;
	share: number;
	previousShare: number;
}): WeaponTrend {
	return {
		weaponSplId,
		sharePercentage: Math.round(share * 1000) / 10,
		changePercentage:
			previousShare === 0
				? null
				: Math.round((share / previousShare - 1) * 100),
	};
}
