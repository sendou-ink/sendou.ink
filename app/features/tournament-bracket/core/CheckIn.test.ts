import { describe, expect, test } from "vitest";
import * as CheckIn from "./CheckIn";
import type { ParsedBracket } from "./Progression";

const DAY_2_START = 1_790_528_400;

const bracket = (partial: Partial<ParsedBracket>): ParsedBracket => ({
	name: "Bracket",
	type: "double_elimination",
	requiresCheckIn: true,
	settings: {},
	sources: [{ bracketIdx: 0, placements: [1] }],
	...partial,
});

const progression: ParsedBracket[] = [
	bracket({ type: "swiss", requiresCheckIn: false, sources: undefined }),
	bracket({ startTime: DAY_2_START }),
	bracket({ startTime: DAY_2_START }),
	bracket({ startTime: DAY_2_START + 3600 }),
	bracket({ startTime: DAY_2_START, requiresCheckIn: false }),
	bracket({}),
];

describe("CheckIn.sharedBracketIdxs", () => {
	test.each([
		{ why: "same start time", bracketIdx: 1, expected: [1, 2] },
		{ why: "own start time", bracketIdx: 3, expected: [3] },
		{ why: "no start time", bracketIdx: 5, expected: [5] },
	])("$why", ({ bracketIdx, expected }) => {
		expect(CheckIn.sharedBracketIdxs(bracketIdx, progression)).toEqual(
			expected,
		);
	});
});

describe("CheckIn.isCheckedInToBrackets", () => {
	test.each([
		{ why: "no check-ins", checkIns: [], expected: false },
		{
			why: "event check-in only",
			checkIns: [{ bracketIdx: null, checkedInAt: 1, isCheckOut: 0 }],
			expected: false,
		},
		{
			why: "checked in to a shared bracket",
			checkIns: [{ bracketIdx: 2, checkedInAt: 1, isCheckOut: 0 }],
			expected: true,
		},
		{
			why: "checked in to a bracket not shared",
			checkIns: [{ bracketIdx: 3, checkedInAt: 1, isCheckOut: 0 }],
			expected: false,
		},
		{
			why: "checked out after checking in to a shared bracket",
			checkIns: [
				{ bracketIdx: 2, checkedInAt: 1, isCheckOut: 0 },
				{ bracketIdx: 1, checkedInAt: 2, isCheckOut: 1 },
			],
			expected: false,
		},
		{
			why: "checked in again after checking out",
			checkIns: [
				{ bracketIdx: 1, checkedInAt: 1, isCheckOut: 1 },
				{ bracketIdx: 2, checkedInAt: 2, isCheckOut: 0 },
			],
			expected: true,
		},
	])("$why", ({ checkIns, expected }) => {
		expect(CheckIn.isCheckedInToBrackets(checkIns, [1, 2])).toBe(expected);
	});
});
