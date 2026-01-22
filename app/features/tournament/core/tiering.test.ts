import { describe, expect, it } from "vitest";
import {
	calculateAdjustedScore,
	calculateTentativeTier,
	calculateTierNumber,
	calculateTournamentTierFromTeams,
	MIN_TEAMS_FOR_TIERING,
	TIER_HISTORY_LENGTH,
	TIER_THRESHOLDS,
	TIER_TO_NUMBER,
	type TournamentTierNumber,
	tierNumberToName,
	updateTierHistory,
} from "./tiering";

describe("calculateTierNumber", () => {
	it("returns null for null input", () => {
		expect(calculateTierNumber(null)).toBe(null);
	});

	it("returns X tier (1) for scores >= 32", () => {
		expect(calculateTierNumber(32)).toBe(1);
		expect(calculateTierNumber(35)).toBe(1);
		expect(calculateTierNumber(100)).toBe(1);
	});

	it("returns A tier (5) for scores >= 21 and < 24", () => {
		expect(calculateTierNumber(21)).toBe(5);
		expect(calculateTierNumber(23.9)).toBe(5);
	});

	it("returns C tier (9) for scores < 5", () => {
		expect(calculateTierNumber(4.9)).toBe(9);
		expect(calculateTierNumber(0)).toBe(9);
		expect(calculateTierNumber(-10)).toBe(9);
	});
});

describe("tierNumberToName", () => {
	it("converts all tier numbers correctly", () => {
		expect(tierNumberToName(1)).toBe("X");
		expect(tierNumberToName(2)).toBe("S+");
		expect(tierNumberToName(3)).toBe("S");
		expect(tierNumberToName(4)).toBe("A+");
		expect(tierNumberToName(5)).toBe("A");
		expect(tierNumberToName(6)).toBe("B+");
		expect(tierNumberToName(7)).toBe("B");
		expect(tierNumberToName(8)).toBe("C+");
		expect(tierNumberToName(9)).toBe("C");
	});

	it("throws for invalid tier numbers", () => {
		expect(() => tierNumberToName(0)).toThrow("Invalid tier number: 0");
		expect(() => tierNumberToName(10)).toThrow("Invalid tier number: 10");
	});
});

describe("calculateAdjustedScore", () => {
	it("returns raw score when at X-tier threshold (no bonus)", () => {
		expect(calculateAdjustedScore(32, 50)).toBe(32);
	});

	it("returns raw score when below MIN_TEAMS_FOR_TIERING", () => {
		expect(calculateAdjustedScore(20, MIN_TEAMS_FOR_TIERING)).toBe(20);
	});

	it("applies size bonus for lower skill tournaments with many teams", () => {
		const rawScore = 20;
		const teamCount = 50;
		const adjusted = calculateAdjustedScore(rawScore, teamCount);

		expect(adjusted).toBeGreaterThan(rawScore);
	});

	it("applies larger bonus at lower skill levels", () => {
		const teamCount = 50;
		const bonusAtScore20 = calculateAdjustedScore(20, teamCount) - 20;
		const bonusAtScore10 = calculateAdjustedScore(10, teamCount) - 10;

		expect(bonusAtScore10).toBeGreaterThan(bonusAtScore20);
	});

	it("applies larger bonus for more teams", () => {
		const rawScore = 15;
		const bonusAt30Teams = calculateAdjustedScore(rawScore, 30) - rawScore;
		const bonusAt50Teams = calculateAdjustedScore(rawScore, 50) - rawScore;

		expect(bonusAt50Teams).toBeGreaterThan(bonusAt30Teams);
	});

	it("calculates correct bonus for specific case", () => {
		const rawScore = 0;
		const teamCount = 18;
		const teamsAboveMin = teamCount - MIN_TEAMS_FOR_TIERING;
		const maxBonus = 1.5 * (teamsAboveMin / 10);

		const adjusted = calculateAdjustedScore(rawScore, teamCount);
		expect(adjusted).toBeCloseTo(rawScore + maxBonus, 5);
	});
});

describe("calculateTournamentTierFromTeams", () => {
	it("returns null tier for tournaments below MIN_TEAMS_FOR_TIERING", () => {
		const teams = [{ avgOrdinal: 30 }, { avgOrdinal: 28 }];
		const result = calculateTournamentTierFromTeams(teams, 7);

		expect(result.tierNumber).toBe(null);
		expect(result.rawScore).toBe(null);
		expect(result.adjustedScore).toBe(null);
	});

	it("returns null tier when all teams have null ordinals", () => {
		const teams = [{ avgOrdinal: null }, { avgOrdinal: null }];
		const result = calculateTournamentTierFromTeams(teams, 10);

		expect(result.tierNumber).toBe(null);
	});

	it("returns null tier for empty teams array with sufficient count", () => {
		const result = calculateTournamentTierFromTeams([], 10);

		expect(result.tierNumber).toBe(null);
	});

	it("calculates tier from top 8 teams by ordinal", () => {
		const teams = [
			{ avgOrdinal: 35 },
			{ avgOrdinal: 34 },
			{ avgOrdinal: 33 },
			{ avgOrdinal: 32 },
			{ avgOrdinal: 31 },
			{ avgOrdinal: 30 },
			{ avgOrdinal: 29 },
			{ avgOrdinal: 28 },
			{ avgOrdinal: 10 },
			{ avgOrdinal: 5 },
		];
		const result = calculateTournamentTierFromTeams(teams, 10);

		expect(result.rawScore).toBeCloseTo(31.5, 5);
		expect(result.tierNumber).toBe(TIER_TO_NUMBER["S+"]);
	});

	it("ignores teams with null ordinals when calculating", () => {
		const teams = [
			{ avgOrdinal: 30 },
			{ avgOrdinal: null },
			{ avgOrdinal: 28 },
			{ avgOrdinal: null },
			{ avgOrdinal: 26 },
			{ avgOrdinal: 24 },
			{ avgOrdinal: 22 },
			{ avgOrdinal: 20 },
			{ avgOrdinal: 18 },
			{ avgOrdinal: 16 },
		];
		const result = calculateTournamentTierFromTeams(teams, 10);

		expect(result.tierNumber).not.toBe(null);
	});

	it("applies size bonus correctly", () => {
		const teams = Array.from({ length: 50 }, () => ({ avgOrdinal: 20 }));
		const result = calculateTournamentTierFromTeams(teams, 50);

		expect(result.adjustedScore).toBeGreaterThan(result.rawScore!);
	});

	it("uses fewer than 8 teams if not enough available", () => {
		const teams = [{ avgOrdinal: 30 }, { avgOrdinal: 28 }, { avgOrdinal: 26 }];
		const result = calculateTournamentTierFromTeams(teams, 8);

		expect(result.rawScore).toBeCloseTo(28, 5);
		expect(result.tierNumber).not.toBe(null);
	});
});

describe("TIER_THRESHOLDS matches TIER_TO_NUMBER", () => {
	it("all tiers in TIER_THRESHOLDS have corresponding number", () => {
		for (const tier of Object.keys(TIER_THRESHOLDS)) {
			expect(TIER_TO_NUMBER).toHaveProperty(tier);
		}
	});
});

describe("calculateTentativeTier", () => {
	it("returns null for empty history", () => {
		expect(calculateTentativeTier([])).toBe(null);
	});

	it("returns the single value for history with one element", () => {
		expect(calculateTentativeTier([4])).toBe(4);
	});

	it("returns median for odd number of elements", () => {
		expect(calculateTentativeTier([5, 4, 3])).toBe(4);
		expect(calculateTentativeTier([1, 2, 3, 4, 5])).toBe(3);
	});

	it("rounds toward lower tier (higher number) for even count", () => {
		expect(calculateTentativeTier([4, 5])).toBe(5);
		expect(calculateTentativeTier([3, 4])).toBe(4);
	});

	it("returns median for unsorted input", () => {
		expect(calculateTentativeTier([3, 5, 4, 2, 6])).toBe(4);
	});

	it("handles duplicate values correctly", () => {
		expect(calculateTentativeTier([4, 4, 4])).toBe(4);
		expect(calculateTentativeTier([5, 5, 4, 4])).toBe(5);
	});
});

describe("updateTierHistory", () => {
	it("creates new history from null", () => {
		expect(updateTierHistory(null, 4)).toEqual([4]);
	});

	it("appends to existing history", () => {
		expect(updateTierHistory([5, 4], 3)).toEqual([5, 4, 3]);
	});

	it("keeps history at max length", () => {
		const fullHistory: TournamentTierNumber[] = [1, 2, 3, 4, 5];
		expect(updateTierHistory(fullHistory, 6)).toEqual([2, 3, 4, 5, 6]);
	});

	it("preserves history under max length", () => {
		expect(updateTierHistory([4, 5], 3)).toEqual([4, 5, 3]);
	});

	it("slices from beginning when exceeding max length", () => {
		const history: TournamentTierNumber[] = [1, 2, 3, 4, 5];
		const result = updateTierHistory(history, 9);
		expect(result.length).toBe(TIER_HISTORY_LENGTH);
		expect(result[result.length - 1]).toBe(9);
		expect(result[0]).toBe(2);
	});
});
