import { describe, expect, test } from "vitest";
import { eliminationGroupCount } from "./settings";

describe("eliminationGroupCount", () => {
	test.each([
		{ groupCount: undefined, participants: 16, expected: 1, why: "not split" },
		{ groupCount: 4, participants: 16, expected: 4, why: "enough teams" },
		{ groupCount: 4, participants: 7, expected: 3, why: "2 teams per group" },
		{ groupCount: 4, participants: 2, expected: 1, why: "one pair" },
		{ groupCount: 4, participants: 0, expected: 1, why: "no teams" },
	])("$why", ({ groupCount, participants, expected }) => {
		expect(eliminationGroupCount({ groupCount }, participants)).toBe(expected);
	});
});
