import { describe, expect, test } from "vitest";
import * as FeedSeasonGoal from "./FeedSeasonGoal";

const INTERVALS = [
	{ name: "LEVIATHAN", isPlus: true, neededOrdinal: 100 },
	{ name: "LEVIATHAN", isPlus: false, neededOrdinal: 90 },
	{ name: "DIAMOND", isPlus: true, neededOrdinal: 80 },
	{ name: "DIAMOND", isPlus: false },
] as const;

describe("FeedSeasonGoal.seasonEndGoal", () => {
	test.each([
		{
			why: "two sets short of getting ranked",
			matchesCount: 5,
			ordinal: 0,
			expected: { type: "GET_RANKED", setsShort: 2 },
		},
		{
			why: "many sets short of getting ranked",
			matchesCount: 1,
			ordinal: 0,
			expected: { type: "GET_RANKED", setsShort: 6 },
		},
		{
			why: "one ordinal (15 SP) short of the next tier",
			matchesCount: 20,
			ordinal: 89,
			expected: {
				type: "NEXT_TIER",
				tier: { name: "LEVIATHAN", isPlus: false },
				spShort: 15,
			},
		},
		{
			why: "too much SP short of the next tier",
			matchesCount: 20,
			ordinal: 87,
			expected: null,
		},
		{
			why: "below every tier with a needed ordinal",
			matchesCount: 20,
			ordinal: 79,
			expected: {
				type: "NEXT_TIER",
				tier: { name: "DIAMOND", isPlus: true },
				spShort: 15,
			},
		},
		{
			why: "already in the top tier",
			matchesCount: 20,
			ordinal: 120,
			expected: null,
		},
	])("$why", ({ matchesCount, ordinal, expected }) => {
		expect(
			FeedSeasonGoal.seasonEndGoal({
				matchesCount,
				ordinal,
				intervals: [...INTERVALS],
			}),
		).toEqual(expected);
	});
});
