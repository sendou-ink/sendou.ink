import { describe, expect, test } from "vitest";
import * as FeedLfgMatch from "./FeedLfgMatch";

const own = {
	timezone: "Asia/Tokyo",
	languages: null,
	tierRank: 10,
} satisfies FeedLfgMatch.LfgPostProfile;

describe("FeedLfgMatch.match", () => {
	test.each([
		{
			why: "same timezone and tier",
			other: { timezone: "Asia/Tokyo", tierRank: 10 },
			expected: 1,
		},
		{
			why: "an hour apart counts as the same timezone",
			other: { timezone: "Asia/Shanghai", tierRank: 10 },
			expected: 1,
		},
		{
			why: "timezone outweighs skill",
			other: { timezone: "Asia/Tokyo", tierRank: 4 },
			expected: 0.75,
		},
		{
			why: "4 hours apart, same tier",
			other: { timezone: "Asia/Karachi", tierRank: 10 },
			expected: 0.625,
		},
		{
			why: "3 hours apart, 3 tier steps apart",
			other: { timezone: "Asia/Dhaka", tierRank: 7 },
			expected: 0.625,
		},
		{
			why: "no tier counts as half a skill match",
			other: { timezone: "Asia/Shanghai", tierRank: null },
			expected: 0.875,
		},
		{
			why: "too many hours apart even with the same tier",
			other: { timezone: "Etc/UTC", tierRank: 10 },
			expected: null,
		},
	])("$why", ({ other, expected }) => {
		const result = FeedLfgMatch.match(own, { ...other, languages: null });

		if (expected === null) {
			expect(result).toBeNull();
		} else {
			expect(result).toBeCloseTo(expected);
		}
	});

	test.each([
		{ why: "no language in common", languages: ["fi"], expected: false },
		{ why: "a language in common", languages: ["en", "ja"], expected: true },
		{ why: "the other lists none", languages: [], expected: true },
	])("$why", ({ languages, expected }) => {
		const result = FeedLfgMatch.match(
			{ ...own, languages: ["en", "de"] },
			{ ...own, languages },
		);

		expect(result !== null).toBe(expected);
	});
});

describe("FeedLfgMatch.levelMatch", () => {
	test.each([
		{ why: "same tier", other: 10, expected: 1 },
		{ why: "3 tier steps apart", other: 7, expected: 0.5 },
		{ why: "4 tier steps apart", other: 14, expected: null },
		{ why: "no tier counts as half a match", other: null, expected: 0.5 },
	])("$why", ({ other, expected }) => {
		const result = FeedLfgMatch.levelMatch(10, other);

		if (expected === null) {
			expect(result).toBeNull();
		} else {
			expect(result).toBeCloseTo(expected);
		}
	});
});

describe("FeedLfgMatch.medianTierRank", () => {
	test.each([
		{ why: "no tiers", tierRanks: [], expected: null },
		{ why: "odd count", tierRanks: [5, 1, 3], expected: 3 },
		{ why: "even count", tierRanks: [4, 1, 3, 2], expected: 2.5 },
	])("$why", ({ tierRanks, expected }) => {
		expect(FeedLfgMatch.medianTierRank(tierRanks)).toBe(expected);
	});
});
