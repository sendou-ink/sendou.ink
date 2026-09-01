import { cachified } from "@epic-web/cachified";
import type { Tables } from "~/db/tables";
import { cache, IN_MILLISECONDS, ttl } from "~/utils/cache.server";
import { MATCHES_COUNT_NEEDED_FOR_LEADERBOARD } from "../leaderboards/leaderboards-constants";
import { USER_SKILLS_CACHE_KEY } from "../sendouq/q-constants";
import {
	TEAM_LEADERBOARD_MIN_ENTRIES_FOR_LEVIATHAN,
	TIERS,
	TIERS_BEFORE_LEVIATHAN,
	type TierName,
	USER_LEADERBOARD_MIN_ENTRIES_FOR_LEVIATHAN,
} from "./mmr-constants";
import * as SkillRepository from "./SkillRepository.server";

export interface TieredSkill {
	ordinal: number;
	tier: {
		name: TierName;
		isPlus: boolean;
	};
	approximate: boolean;
}

export async function freshUserSkills(season: number): Promise<{
	userSkills: Record<string, TieredSkill>;
	intervals: SkillTierInterval[];
	isAccurateTiers: boolean;
}> {
	const points = await SkillRepository.findOrderedUserOrdinalsBySeason(season);

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

export function userSkills(season: number, { forceFresh = false } = {}) {
	return cachified({
		key: userSkillsCacheKey(season),
		cache,
		forceFresh,
		// no ttl once the season has skills: its tiers only go stale when a match
		// of it is played, and those code paths refresh this themselves
		getFreshValue: async (context) => {
			const value = await freshUserSkills(season);

			if (Object.keys(value.userSkills).length === 0) {
				context.metadata.ttl = ttl(IN_MILLISECONDS.HALF_HOUR);
			}

			return value;
		},
	});
}

export async function refreshUserSkills(season: number) {
	await userSkills(season, { forceFresh: true });
}

export type SkillTierInterval = ReturnType<
	typeof skillTierIntervals
>["intervals"][number];

function skillTierIntervals(
	orderedPoints: Array<Pick<Tables["Skill"], "ordinal" | "matchesCount">>,
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
		// tiers from all entries, whether or not they have enough to be on the leaderboard
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
			// with few enough players the very first one already exceeds the top
			// tier's share, and there is nobody below them to close the tier at
			const previousPoints = points[i - 1] ?? points[i];
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
