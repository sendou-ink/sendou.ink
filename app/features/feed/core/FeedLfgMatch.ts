import { hourDifferenceBetweenTimezones } from "~/features/lfg/core/timezone";
import {
	FEED_LFG_FULL_MATCH_HOURS,
	FEED_LFG_MIN_MATCH,
	FEED_LFG_NO_MATCH_HOURS,
	FEED_LFG_NO_MATCH_TIER_STEPS,
	FEED_LFG_TIMEZONE_WEIGHT,
} from "../feed-constants";

export interface LfgPostProfile {
	/** e.g. Europe/Helsinki */
	timezone: string;
	languages: string[] | null;
	/** `FeedEvents.tierRank` of the post's SendouQ tier, `null` without an accurate one */
	tierRank: number | null;
}

/**
 * How well another LFG post fits the viewer's own, 0–1: timezone closeness weighted by
 * `FEED_LFG_TIMEZONE_WEIGHT`, skill closeness by the rest. `null` when it doesn't fit well enough
 * to show (below `FEED_LFG_MIN_MATCH`) or both posts list languages but none in common.
 */
export function match(
	own: LfgPostProfile,
	other: LfgPostProfile,
): number | null {
	if (!sharesLanguage(own.languages, other.languages)) return null;

	const timezone = timezoneScore(
		Math.abs(hourDifferenceBetweenTimezones(own.timezone, other.timezone)),
	);
	const skill = skillScore(
		own.tierRank !== null && other.tierRank !== null
			? Math.abs(own.tierRank - other.tierRank)
			: null,
	);
	const result =
		FEED_LFG_TIMEZONE_WEIGHT * timezone +
		(1 - FEED_LFG_TIMEZONE_WEIGHT) * skill;

	return result >= FEED_LFG_MIN_MATCH ? result : null;
}

/**
 * How well a tournament team's level fits the viewer's, 0–1: the skill part of `match` alone, since
 * the tournament fixes the time. `null` below `FEED_LFG_MIN_MATCH`.
 */
export function levelMatch(
	ownTierRank: number | null,
	otherTierRank: number | null,
): number | null {
	const result = skillScore(
		ownTierRank !== null && otherTierRank !== null
			? Math.abs(ownTierRank - otherTierRank)
			: null,
	);

	return result >= FEED_LFG_MIN_MATCH ? result : null;
}

/** Median of the tier ranks, how a team post's skill is measured. `null` when there are none. */
export function medianTierRank(tierRanks: number[]) {
	if (tierRanks.length === 0) return null;

	const sorted = tierRanks.toSorted((a, b) => a - b);
	const middle = Math.floor(sorted.length / 2);

	return sorted.length % 2 === 1
		? sorted[middle]
		: (sorted[middle - 1] + sorted[middle]) / 2;
}

/** Timezone part of `match`, 0–1 from the hours between the posts' timezones */
export function timezoneScore(hours: number) {
	return closeness({
		distance: hours,
		full: FEED_LFG_FULL_MATCH_HOURS,
		none: FEED_LFG_NO_MATCH_HOURS,
	});
}

/** Skill part of `match`, 0–1 from the tier steps between the posts, `null` when either has no accurate tier */
export function skillScore(tierSteps: number | null) {
	if (tierSteps === null) return 0.5;

	return closeness({
		distance: tierSteps,
		full: 0,
		none: FEED_LFG_NO_MATCH_TIER_STEPS,
	});
}

/** 1 up to `full`, then linearly down to 0 at `none` */
function closeness({
	distance,
	full,
	none,
}: {
	distance: number;
	full: number;
	none: number;
}) {
	if (distance <= full) return 1;

	return Math.max(0, 1 - (distance - full) / (none - full));
}

function sharesLanguage(a: string[] | null, b: string[] | null) {
	if (!a?.length || !b?.length) return true;

	return a.some((language) => b.includes(language));
}
