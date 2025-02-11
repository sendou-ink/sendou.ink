import { describe, expect, test } from "vitest";
import {
	fillWithNullTillPowerOfTwo,
	mapCountPlayedInSetWithCertainty,
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
