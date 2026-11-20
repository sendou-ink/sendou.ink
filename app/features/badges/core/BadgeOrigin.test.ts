import { describe, expect, test } from "vitest";
import * as BadgeOrigin from "./BadgeOrigin";

describe("BadgeOrigin.awardedFor", () => {
	test.each([
		{ why: "supporter badge", code: "patreon", expected: "PATRON" },
		{ why: "supporter+ badge", code: "patreon_plus", expected: "PATRON_PLUS" },
		{ why: "Splatoon 2 XP badge", code: "xp29", expected: "XP" },
		{ why: "Splatoon 3 XP badge", code: "3200", expected: "XP" },
		{ why: "number not an XP tier", code: "3250", expected: "TOURNAMENT" },
		{ why: "tournament prize", code: "itz_red", expected: "TOURNAMENT" },
	])("$why", ({ code, expected }) => {
		expect(BadgeOrigin.awardedFor({ code })).toBe(expected);
	});
});

describe("BadgeOrigin.xpBadgeValue", () => {
	test.each([
		{ why: "exactly a tier", peakXp: 3000, expected: 3000 },
		{ why: "between tiers rounds down", peakXp: 3250.5, expected: 3200 },
		{ why: "above the top tier", peakXp: 5300, expected: 5000 },
		{ why: "lowest tier", peakXp: 2600, expected: 2600 },
		{ why: "below the lowest tier", peakXp: 2599.9, expected: null },
	])("$why", ({ peakXp, expected }) => {
		expect(BadgeOrigin.xpBadgeValue(peakXp)).toBe(expected);
	});
});

describe("BadgeOrigin.legacyMakerName", () => {
	test.each([
		{
			why: "top Splatoon 3 XP badge",
			displayName: "XP4000 (Splatoon 3)",
			expected: "Dreamy",
		},
		{
			why: "lower Splatoon 3 XP badge",
			displayName: "XP3000 (Splatoon 3)",
			expected: "borzoic",
		},
		{
			why: "tournament badge",
			displayName: "In The Zone",
			expected: "borzoic",
		},
	])("$why", ({ displayName, expected }) => {
		expect(BadgeOrigin.legacyMakerName({ displayName })).toBe(expected);
	});
});
