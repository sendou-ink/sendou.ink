import { describe, expect, test } from "vitest";
import { tierOfOrdinal } from "./mmr-utils";
import type { SkillTierInterval } from "./tiered.server";

const INTERVALS: SkillTierInterval[] = [
	{ name: "DIAMOND", isPlus: true, neededOrdinal: 30 },
	{ name: "DIAMOND", isPlus: false, neededOrdinal: 20 },
	{ name: "PLATINUM", isPlus: true },
];

describe("tierOfOrdinal", () => {
	test.each([
		{ why: "above the top threshold", ordinal: 50, expected: "DIAMOND+" },
		{ why: "exactly at a threshold", ordinal: 20, expected: "DIAMOND" },
		{ why: "between two thresholds", ordinal: 25, expected: "DIAMOND" },
		{ why: "under every threshold", ordinal: 10, expected: "IRON" },
	])("$why", ({ ordinal, expected }) => {
		const tier = tierOfOrdinal(INTERVALS, ordinal);

		expect(`${tier.name}${tier.isPlus ? "+" : ""}`).toBe(expected);
	});
});
