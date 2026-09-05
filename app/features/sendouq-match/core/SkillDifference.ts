import { MATCHES_COUNT_NEEDED_FOR_LEADERBOARD } from "~/features/leaderboards/leaderboards-constants";
import { defaultOrdinal, ordinalToSp } from "~/features/mmr/mmr-utils";
import { roundToNDecimalPlaces } from "~/utils/number";

type CalculatingSkill = {
	calculated: false;
	matchesCount: number;
	matchesCountNeeded: number;
	newSp?: number;
};

export type UserSkillDifference =
	| {
			calculated: true;
			spDiff: number;
			oldSp?: number;
			newSp?: number;
	  }
	| CalculatingSkill;

export type GroupSkillDifference =
	| {
			calculated: true;
			oldSp: number;
			newSp: number;
	  }
	| CalculatingSkill;

/** A rating a match produced with the one it replaced (two consecutive season `Skill` rows). `previous*` are `null` for the season's first rating. */
export interface RatingChange {
	ordinal: number;
	previousOrdinal: number | null;
	previousMatchesCount: number | null;
}

/** What a match did to one player's SP, as their match page shows it. */
export function forUser(change: RatingChange): UserSkillDifference {
	const { oldSp, newSp, calculated, matchesCount } = resolve(change);

	if (!calculated) {
		return calculatingSkill({ matchesCount, newSp });
	}

	return {
		calculated,
		spDiff: roundToNDecimalPlaces(newSp - oldSp),
		oldSp,
		newSp,
	};
}

/** What a match did to one group's team SP, as their match page shows it. */
export function forGroup(change: RatingChange): GroupSkillDifference {
	const { oldSp, newSp, calculated, matchesCount } = resolve(change);

	if (!calculated) {
		return calculatingSkill({ matchesCount, newSp });
	}

	return { calculated, oldSp, newSp };
}

function resolve({
	ordinal,
	previousOrdinal,
	previousMatchesCount,
}: RatingChange) {
	const matchesCount = previousMatchesCount ?? 0;

	return {
		calculated: matchesCount >= MATCHES_COUNT_NEEDED_FOR_LEADERBOARD,
		matchesCount,
		oldSp: ordinalToSp(previousOrdinal ?? defaultOrdinal()),
		newSp: ordinalToSp(ordinal),
	};
}

function calculatingSkill({
	matchesCount,
	newSp,
}: {
	matchesCount: number;
	newSp: number;
}): CalculatingSkill {
	return {
		calculated: false,
		matchesCount: matchesCount + 1,
		matchesCountNeeded: MATCHES_COUNT_NEEDED_FOR_LEADERBOARD,
		newSp:
			matchesCount + 1 === MATCHES_COUNT_NEEDED_FOR_LEADERBOARD
				? newSp
				: undefined,
	};
}
