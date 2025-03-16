import type { Skill } from "~/db/types";
import { cache, syncCached } from "~/utils/cache.server";
import { MATCHES_COUNT_NEEDED_FOR_LEADERBOARD } from "../leaderboards/leaderboards-constants";
import { USER_SKILLS_CACHE_KEY } from "../sendouq/q-constants";
import {
	TEAM_LEADERBOARD_MIN_ENTRIES_FOR_LEVIATHAN,
	TIERS,
	TIERS_BEFORE_LEVIATHAN,
	type TierName,
	USER_LEADERBOARD_MIN_ENTRIES_FOR_LEVIATHAN,
} from "./mmr-constants";
import { orderedMMRBySeason } from "./queries/orderedMMRBySeason.server";

export interface TieredSkill {
	ordinal: number;
	tier: {
		name: TierName;
		isPlus: boolean;
	};
	approximate: boolean;
}

export function freshUserSkills(season: number): {
	userSkills: Record<string, TieredSkill>;
	intervals: SkillTierInterval[];
	isAccurateTiers: boolean;
} {
	const points = orderedMMRBySeason({
		season,
		type: "user",
	});

	const { intervals, isAccurateTiers } = skillTierIntervals(points, "user");

	return {
		intervals,
		isAccurateTiers,
		userSkills: Object.fromEntries(
			points.map((p) => {
				const { name, isPlus } = intervals.find(
					(t) => t.neededOrdinal! <= p.ordinal,
				) ?? { name: "IRON", isPlus: false };
				return [
					p.userId as number,
					{
						ordinal: p.ordinal,
						tier: { name, isPlus },
						approximate: p.matchesCount < MATCHES_COUNT_NEEDED_FOR_LEADERBOARD,
					},
				];
			}),
		),
	};
}

const userSkillsCacheKey = (season: number) =>
	`${USER_SKILLS_CACHE_KEY}-${season}`;

export function userSkills(season: number) {
	return syncCached(userSkillsCacheKey(season), () => freshUserSkills(season));
}

export function refreshUserSkills(season: number) {
	cache.delete(userSkillsCacheKey(season));

	userSkills(season);
}

export type SkillTierInterval = ReturnType<
	typeof skillTierIntervals
>["intervals"][number];

function skillTierIntervals(
	orderedPoints: Array<Pick<Skill, "ordinal" | "matchesCount">>,
	type: "user" | "team",
) {
	const LEADERBOARD_MIN_ENTRIES_FOR_LEVIATHAN =
		type === "user"
			? USER_LEADERBOARD_MIN_ENTRIES_FOR_LEVIATHAN
			: TEAM_LEADERBOARD_MIN_ENTRIES_FOR_LEVIATHAN;
	let points = orderedPoints.filter(
		(p) => p.matchesCount >= MATCHES_COUNT_NEEDED_FOR_LEADERBOARD,
	);
	const hasLeviathan = points.length >= LEADERBOARD_MIN_ENTRIES_FOR_LEVIATHAN;
	if (!hasLeviathan) {
		// using all entries, no matter if they have enough to be on the leaderboard
		// to create the tiers
		points = orderedPoints;
	}

	const totalPlayers = points.length;

	const tiersToUse = hasLeviathan ? TIERS : TIERS_BEFORE_LEVIATHAN;

	const allTiers = tiersToUse.flatMap((tier) =>
		[true, false].map((isPlus) => ({
			...tier,
			isPlus,
			percentile: tier.percentile / 2,
		})),
	);
	const result: Array<{
		name: TierName;
		isPlus: boolean;
		/** inclusive */
		neededOrdinal?: number;
	}> = [
		{
			name: tiersToUse[0].name,
			isPlus: true,
		},
	];

	if (points.length === 1) {
		result[0].neededOrdinal = points[0].ordinal;
		return { intervals: result, isAccurateTiers: hasLeviathan };
	}

	let previousPercentiles = 0;
	for (let i = 0; i < points.length; i++) {
		const currentTier = allTiers[result.length - 1];
		const currentPercentile = ((i + 1) / totalPlayers) * 100;

		// "isPlus" is top 50% of that tier
		const accPercentile = previousPercentiles + currentTier.percentile;

		if (currentPercentile > accPercentile) {
			const previousPoints = points[i - 1];
			const thisTier = result[result.length - 1];
			thisTier.neededOrdinal = previousPoints.ordinal;

			const newTier = allTiers[result.length];
			result.push({
				name: newTier.name,
				isPlus: newTier.isPlus,
			});
			previousPercentiles = accPercentile;
		}
	}

	return { intervals: result, isAccurateTiers: hasLeviathan };
}
