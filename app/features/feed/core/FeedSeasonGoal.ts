import { MATCHES_COUNT_NEEDED_FOR_LEADERBOARD } from "~/features/leaderboards/leaderboards-constants";
import { ordinalToSp } from "~/features/mmr/mmr-utils";
import { FEED_SEASON_ENDING_MAX_SP_SHORT } from "../feed-constants";
import type { FeedTier } from "../feed-types";

export type SeasonGoal =
	| { type: "GET_RANKED"; setsShort: number }
	| { type: "NEXT_TIER"; tier: FeedTier; spShort: number };

/**
 * What a player can still reach before the season ends: the sets they're short of getting ranked or, once
 * ranked, the next tier when it's at most `FEED_SEASON_ENDING_MAX_SP_SHORT` away. `null` when neither applies.
 */
export function seasonEndGoal({
	matchesCount,
	ordinal,
	intervals,
}: {
	matchesCount: number;
	ordinal: number;
	/** Tiers of the season, highest first, see `SkillTierInterval` */
	intervals: Array<FeedTier & { neededOrdinal?: number }>;
}): SeasonGoal | null {
	if (matchesCount < MATCHES_COUNT_NEEDED_FOR_LEADERBOARD) {
		return {
			type: "GET_RANKED",
			setsShort: MATCHES_COUNT_NEEDED_FOR_LEADERBOARD - matchesCount,
		};
	}

	const nextTier = intervals.findLast(
		(interval) =>
			interval.neededOrdinal !== undefined && interval.neededOrdinal > ordinal,
	);
	if (!nextTier) return null;

	const spShort = Math.ceil(
		ordinalToSp(nextTier.neededOrdinal!) - ordinalToSp(ordinal),
	);
	if (spShort > FEED_SEASON_ENDING_MAX_SP_SHORT) return null;

	return {
		type: "NEXT_TIER",
		tier: { name: nextTier.name, isPlus: nextTier.isPlus },
		spShort,
	};
}
