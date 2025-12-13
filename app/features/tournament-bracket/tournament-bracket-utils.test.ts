import { describe, expect, test } from "vitest";
import {
	fillWithNullTillPowerOfTwo,
	groupNumberToLetters,
	mapCountPlayedInSetWithCertainty,
	matchEndedEarly,
	resolveRoomPass,
	validateBadgeReceivers,
} from "./tournament-bracket-utils";

const mapCountParamsToResult: {
	bestOf: number;
	scores: [number, number];
	expected: number;
}[] = [
	{ bestOf: 3, scores: [0, 0], expected: 2 },
	{ bestOf: 3, scores: [1, 0], expected: 2 },
	{ bestOf: 3, scores: [1, 1], expected: 3 },
	{ bestOf: 5, scores: [0, 0], expected: 3 },
	{ bestOf: 5, scores: [1, 0], expected: 3 },
	{ bestOf: 5, scores: [2, 0], expected: 3 },
	{ bestOf: 5, scores: [2, 1], expected: 4 },
	{ bestOf: 7, scores: [0, 0], expected: 4 },
	{ bestOf: 7, scores: [2, 2], expected: 6 },
];

describe("mapCountPlayedInSetWithCertainty()", () => {
	for (const { bestOf, scores, expected } of mapCountParamsToResult) {
		test(`bestOf=${bestOf}, scores=${scores.join(",")} -> ${expected}`, () => {
			expect(mapCountPlayedInSetWithCertainty({ bestOf, scores })).toBe(
				expected,
			);
		});
	}
});

const powerOfTwoParamsToResults: [
	amountOfTeams: number,
	expectedNullCount: number,
][] = [
	[32, 0],
	[16, 0],
	[8, 0],
	[31, 1],
	[0, 0],
	[17, 15],
];

describe("fillWithNullTillPowerOfTwo()", () => {
	for (const [amountOfTeams, expectedNullCount] of powerOfTwoParamsToResults) {
		test(`amountOfTeams=${amountOfTeams} -> ${expectedNullCount}`, () => {
			expect(
				fillWithNullTillPowerOfTwo(Array(amountOfTeams).fill("team")).filter(
					(x) => x === null,
				).length,
			).toBe(expectedNullCount);
		});
	}
});

const groupNumberToLettersParamsToResult = [
	{ groupNumber: 1, expected: "A" },
	{ groupNumber: 26, expected: "Z" },
	{ groupNumber: 27, expected: "AA" },
	{ groupNumber: 52, expected: "AZ" },
	{ groupNumber: 53, expected: "BA" },
	{ groupNumber: 702, expected: "ZZ" },
	{ groupNumber: 703, expected: "AAA" },
];

describe("groupNumberToLetters()", () => {
	for (const { groupNumber, expected } of groupNumberToLettersParamsToResult) {
		test(`groupNumber=${groupNumber} -> ${expected}`, () => {
			expect(groupNumberToLetters(groupNumber)).toBe(expected);
		});
	}

	describe("validateNewBadgeOwners", () => {
		const badges = [{ id: 1 }, { id: 2 }];

		test("returns BADGE_NOT_ASSIGNED if a badge has no owner", () => {
			const badgeReceivers = [
				{ badgeId: 1, userIds: [10], tournamentTeamId: 100 },
			];
			expect(validateBadgeReceivers({ badgeReceivers, badges })).toBe(
				"BADGE_NOT_ASSIGNED",
			);
		});

		test("returns BADGE_NOT_ASSIGNED if a badge owner has empty userIds", () => {
			const badgeReceivers = [
				{ badgeId: 1, userIds: [], tournamentTeamId: 100 },
				{ badgeId: 2, userIds: [20], tournamentTeamId: 101 },
			];
			expect(validateBadgeReceivers({ badgeReceivers, badges })).toBe(
				"BADGE_NOT_ASSIGNED",
			);
		});

		test("returns DUPLICATE_TOURNAMENT_TEAM_ID if tournamentTeamId is duplicated", () => {
			const badgeReceivers = [
				{ badgeId: 1, userIds: [10], tournamentTeamId: 100 },
				{ badgeId: 2, userIds: [20], tournamentTeamId: 100 },
			];
			expect(validateBadgeReceivers({ badgeReceivers, badges })).toBe(
				"DUPLICATE_TOURNAMENT_TEAM_ID",
			);
		});

		test("returns BADGE_NOT_FOUND if some receiver has a badge not from the tournament", () => {
			const badgeReceivers = [
				{ badgeId: 1, userIds: [10], tournamentTeamId: 100 },
			];
			expect(
				validateBadgeReceivers({ badgeReceivers, badges: [{ id: 2 }] }),
			).toBe("BADGE_NOT_FOUND");
		});

		test("returns null if all badges are assigned and tournamentTeamIds are unique", () => {
			const badgeReceivers = [
				{ badgeId: 1, userIds: [10], tournamentTeamId: 100 },
				{ badgeId: 2, userIds: [20], tournamentTeamId: 101 },
			];
			expect(validateBadgeReceivers({ badgeReceivers, badges })).toBeNull();
		});
	});

	describe("resolveRoomPass", () => {
		test("returns a 4-digit password", () => {
			const pass = resolveRoomPass(12345);

			expect(pass).toMatch(/^\d{4}$/);
		});

		test("returns deterministic password for a given numeric seed", () => {
			const pass1 = resolveRoomPass(12345);
			const pass2 = resolveRoomPass(12345);
			expect(pass1).toBe(pass2);
		});

		test("returns deterministic password for a given string seed", () => {
			const pass1 = resolveRoomPass("test-seed");
			const pass2 = resolveRoomPass("test-seed");
			expect(pass1).toBe(pass2);
		});

		test("returns different passwords for different seeds", () => {
			const pass1 = resolveRoomPass(1);
			const pass2 = resolveRoomPass(2);
			expect(pass1).not.toBe(pass2);
		});
	});

	describe("matchEndedEarly", () => {
		test("returns false when no winner", () => {
			expect(
				matchEndedEarly({
					opponentOne: { score: 1 },
					opponentTwo: { score: 1 },
					count: 3,
					countType: "BEST_OF",
				}),
			).toBe(false);
		});

		test("returns false when match completed normally (best of 3)", () => {
			expect(
				matchEndedEarly({
					opponentOne: { score: 2, result: "win" },
					opponentTwo: { score: 1, result: "loss" },
					count: 3,
					countType: "BEST_OF",
				}),
			).toBe(false);
		});

		test("returns true when match ended early (best of 3)", () => {
			expect(
				matchEndedEarly({
					opponentOne: { score: 1, result: "win" },
					opponentTwo: { score: 0, result: "loss" },
					count: 3,
					countType: "BEST_OF",
				}),
			).toBe(true);
		});

		test("returns true when match ended early (best of 5)", () => {
			expect(
				matchEndedEarly({
					opponentOne: { score: 2, result: "win" },
					opponentTwo: { score: 1, result: "loss" },
					count: 5,
					countType: "BEST_OF",
				}),
			).toBe(true);
		});

		test("returns false when match completed normally (best of 5)", () => {
			expect(
				matchEndedEarly({
					opponentOne: { score: 3, result: "win" },
					opponentTwo: { score: 2, result: "loss" },
					count: 5,
					countType: "BEST_OF",
				}),
			).toBe(false);
		});

		test("returns false when all maps played (play all)", () => {
			expect(
				matchEndedEarly({
					opponentOne: { score: 2, result: "win" },
					opponentTwo: { score: 1, result: "loss" },
					count: 3,
					countType: "PLAY_ALL",
				}),
			).toBe(false);
		});

		test("returns true when not all maps played (play all)", () => {
			expect(
				matchEndedEarly({
					opponentOne: { score: 2, result: "win" },
					opponentTwo: { score: 0, result: "loss" },
					count: 3,
					countType: "PLAY_ALL",
				}),
			).toBe(true);
		});

		test("handles missing scores as 0", () => {
			expect(
				matchEndedEarly({
					opponentOne: { result: "win" },
					opponentTwo: { result: "loss" },
					count: 3,
					countType: "BEST_OF",
				}),
			).toBe(true);
		});
	});
});
