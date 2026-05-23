/**
 * Tournament tier calculation based on top teams' average SeedingSkill ordinal.
 * Lower tier number = better tier (like placements).
 */

export const TIER_THRESHOLDS = {
	X: 32,
	"S+": 29,
	S: 26,
	"A+": 24,
	A: 21,
	"B+": 15,
	B: 10,
	"C+": 5,
	C: Number.NEGATIVE_INFINITY,
} as const;

export const TOP_TEAMS_COUNT = 8;
export const MIN_TEAMS_FOR_TIERING = 8;
export const TIER_HISTORY_LENGTH = 5;

const SIZE_BONUS = {
	NO_BONUS_ABOVE: 32,
	MAX_BONUS_PER_10_TEAMS: 1.5,
} as const;

export const TIER_NUMBERS = [1, 2, 3, 4, 5, 6, 7, 8, 9] as const;

export type TournamentTierNumber = (typeof TIER_NUMBERS)[number];
export type TournamentTier =
	| "X"
	| "S+"
	| "S"
	| "A+"
	| "A"
	| "B+"
	| "B"
	| "C+"
	| "C";

export const TIER_TO_NUMBER: Record<TournamentTier, TournamentTierNumber> = {
	X: 1,
	"S+": 2,
	S: 3,
	"A+": 4,
	A: 5,
	"B+": 6,
	B: 7,
	"C+": 8,
	C: 9,
};

const NUMBER_TO_TIER: Record<TournamentTierNumber, TournamentTier> = {
	1: "X",
	2: "S+",
	3: "S",
	4: "A+",
	5: "A",
	6: "B+",
	7: "B",
	8: "C+",
	9: "C",
};

export function calculateAdjustedScore(
	rawScore: number,
	teamCount: number,
): number {
	const scaleFactor = Math.max(
		0,
		(SIZE_BONUS.NO_BONUS_ABOVE - rawScore) / SIZE_BONUS.NO_BONUS_ABOVE,
	);

	const teamsAboveMin = Math.max(0, teamCount - MIN_TEAMS_FOR_TIERING);
	const bonus =
		scaleFactor * SIZE_BONUS.MAX_BONUS_PER_10_TEAMS * (teamsAboveMin / 10);

	return rawScore + bonus;
}

export function calculateTierNumber(
	score: number | null,
): TournamentTierNumber | null {
	if (score === null) return null;

	const tiers = Object.entries(TIER_THRESHOLDS) as [TournamentTier, number][];
	for (const [tier, threshold] of tiers) {
		if (score >= threshold) return TIER_TO_NUMBER[tier];
	}

	return TIER_TO_NUMBER.C;
}

export function tierNumberToName(tierNumber: number): TournamentTier {
	const tier = NUMBER_TO_TIER[tierNumber as TournamentTierNumber];
	if (!tier) {
		throw new Error(`Invalid tier number: ${tierNumber}`);
	}
	return tier;
}

export function calculateTournamentTierFromTeams(
	teams: Array<{ avgOrdinal: number | null }>,
	totalTeamCount: number,
): {
	tierNumber: TournamentTierNumber | null;
	rawScore: number | null;
	adjustedScore: number | null;
} {
	if (totalTeamCount < MIN_TEAMS_FOR_TIERING) {
		return { tierNumber: null, rawScore: null, adjustedScore: null };
	}

	const teamsWithOrdinal = teams.filter(
		(t): t is { avgOrdinal: number } => t.avgOrdinal !== null,
	);

	if (teamsWithOrdinal.length === 0) {
		return { tierNumber: null, rawScore: null, adjustedScore: null };
	}

	const topTeams = teamsWithOrdinal
		.sort((a, b) => b.avgOrdinal - a.avgOrdinal)
		.slice(0, TOP_TEAMS_COUNT);

	const rawScore =
		topTeams.reduce((sum, t) => sum + t.avgOrdinal, 0) / topTeams.length;
	const adjustedScore = calculateAdjustedScore(rawScore, totalTeamCount);
	const tierNumber = calculateTierNumber(adjustedScore);

	return { tierNumber, rawScore, adjustedScore };
}

export function calculateTentativeTier(
	tierHistory: TournamentTierNumber[],
): TournamentTierNumber | null {
	if (tierHistory.length === 0) return null;

	const sorted = [...tierHistory].sort((a, b) => a - b);
	const mid = Math.floor(sorted.length / 2);

	if (sorted.length % 2 === 0) {
		return Math.ceil(
			(sorted[mid - 1] + sorted[mid]) / 2,
		) as TournamentTierNumber;
	}
	return sorted[mid];
}

export function updateTierHistory(
	currentHistory: TournamentTierNumber[] | null,
	newTier: TournamentTierNumber,
): TournamentTierNumber[] {
	const history = currentHistory ?? [];
	const updated = [...history, newTier];
	return updated.length > TIER_HISTORY_LENGTH
		? updated.slice(-TIER_HISTORY_LENGTH)
		: updated;
}
