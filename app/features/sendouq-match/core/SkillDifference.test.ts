import { describe, expect, test } from "vitest";
import { MATCHES_COUNT_NEEDED_FOR_LEADERBOARD } from "~/features/leaderboards/leaderboards-constants";
import * as SkillDifference from "./SkillDifference";

const PREVIOUS_ORDINAL = 10.01;
const ORDINAL = 12.02;
const OLD_SP = 1150.15;
const NEW_SP = 1180.3;

const CALCULATING_CASES = [
	{
		why: "season's first rating",
		previousOrdinal: null,
		previousMatchesCount: null,
		expected: {
			calculated: false,
			matchesCount: 1,
			matchesCountNeeded: MATCHES_COUNT_NEEDED_FOR_LEADERBOARD,
			newSp: undefined,
		},
	},
	{
		why: "two matches short of the reveal",
		previousOrdinal: PREVIOUS_ORDINAL,
		previousMatchesCount: MATCHES_COUNT_NEEDED_FOR_LEADERBOARD - 3,
		expected: {
			calculated: false,
			matchesCount: MATCHES_COUNT_NEEDED_FOR_LEADERBOARD - 2,
			matchesCountNeeded: MATCHES_COUNT_NEEDED_FOR_LEADERBOARD,
			newSp: undefined,
		},
	},
	{
		why: "the match that reveals the rating",
		previousOrdinal: PREVIOUS_ORDINAL,
		previousMatchesCount: MATCHES_COUNT_NEEDED_FOR_LEADERBOARD - 1,
		expected: {
			calculated: false,
			matchesCount: MATCHES_COUNT_NEEDED_FOR_LEADERBOARD,
			matchesCountNeeded: MATCHES_COUNT_NEEDED_FOR_LEADERBOARD,
			newSp: NEW_SP,
		},
	},
];

describe("SkillDifference.forUser()", () => {
	test.each(CALCULATING_CASES)(
		"is still calculating ($why)",
		({ previousOrdinal, previousMatchesCount, expected }) => {
			expect(
				SkillDifference.forUser({
					ordinal: ORDINAL,
					previousOrdinal,
					previousMatchesCount,
				}),
			).toEqual(expected);
		},
	);

	test("resolves the SP change once enough matches have been played", () => {
		expect(
			SkillDifference.forUser({
				ordinal: ORDINAL,
				previousOrdinal: PREVIOUS_ORDINAL,
				previousMatchesCount: MATCHES_COUNT_NEEDED_FOR_LEADERBOARD,
			}),
		).toEqual({
			calculated: true,
			spDiff: 30.15,
			oldSp: OLD_SP,
			newSp: NEW_SP,
		});
	});

	test("reports a negative SP change when the rating dropped", () => {
		expect(
			SkillDifference.forUser({
				ordinal: PREVIOUS_ORDINAL,
				previousOrdinal: ORDINAL,
				previousMatchesCount: MATCHES_COUNT_NEEDED_FOR_LEADERBOARD,
			}),
		).toEqual({
			calculated: true,
			spDiff: -30.15,
			oldSp: NEW_SP,
			newSp: OLD_SP,
		});
	});
});

describe("SkillDifference.forGroup()", () => {
	test.each(CALCULATING_CASES)(
		"is still calculating ($why)",
		({ previousOrdinal, previousMatchesCount, expected }) => {
			expect(
				SkillDifference.forGroup({
					ordinal: ORDINAL,
					previousOrdinal,
					previousMatchesCount,
				}),
			).toEqual(expected);
		},
	);

	test("resolves the team SP change once enough matches have been played", () => {
		expect(
			SkillDifference.forGroup({
				ordinal: ORDINAL,
				previousOrdinal: PREVIOUS_ORDINAL,
				previousMatchesCount: MATCHES_COUNT_NEEDED_FOR_LEADERBOARD,
			}),
		).toEqual({
			calculated: true,
			oldSp: OLD_SP,
			newSp: NEW_SP,
		});
	});
});
