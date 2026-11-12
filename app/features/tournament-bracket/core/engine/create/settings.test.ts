import { describe, expect, test } from "vitest";
import type { SkippableRound } from "~/db/tables-json";
import type { StageType } from "../types";
import { eliminationGroupCount, thirdPlaceMatchLinkable } from "./settings";

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

describe("thirdPlaceMatchLinkable", () => {
	test.each<{
		why: string;
		type?: StageType;
		participantsCount?: number;
		groupCount?: number;
		skippedRounds?: SkippableRound[];
		expected: boolean;
	}>([
		{ why: "finals and third place match both played", expected: true },
		{ why: "finals skipped", skippedRounds: ["FINALS"], expected: false },
		{
			why: "third place match skipped",
			skippedRounds: ["THIRD_PLACE_MATCH"],
			expected: false,
		},
		{ why: "double elimination", type: "double_elimination", expected: false },
		{ why: "three teams", participantsCount: 3, expected: false },
		{
			why: "groups of three teams",
			participantsCount: 6,
			groupCount: 2,
			expected: false,
		},
		{
			why: "groups of four teams",
			participantsCount: 8,
			groupCount: 2,
			expected: true,
		},
	])(
		"$why",
		({
			type = "single_elimination",
			participantsCount = 8,
			groupCount,
			skippedRounds,
			expected,
		}) => {
			expect(
				thirdPlaceMatchLinkable({
					type,
					participantsCount,
					settings: { groupCount, skippedRounds },
				}),
			).toBe(expected);
		},
	);
});
