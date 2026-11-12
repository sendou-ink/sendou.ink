import { type Rating, rating, ordinal as toOrdinal } from "openskill";
import { describe, expect, test } from "vitest";
import { ordinalToSp, rate, tierOfOrdinal } from "./mmr-utils";
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

describe("ordinalToSp", () => {
	test("SP has at most two decimals", () => {
		const sp = ordinalToSp(1.23456);

		expect(Math.round(sp * 100) / 100).toBe(sp);
	});
});

describe("rate", () => {
	const settled = (mu: number) => rating({ mu, sigma: 1 });

	test.each([
		{ why: "rated against the team", playerAverages: undefined },
		{
			why: "rated against the players' averages too",
			playerAverages: [[settled(30)], [settled(20)]] as [[Rating], [Rating]],
		},
	])(
		"winning against a weaker team never lowers a settled rating ($why)",
		({ playerAverages }) => {
			const winner = settled(30);

			const [[newWinner]] = rate([[winner], [settled(20)]], playerAverages);

			expect(toOrdinal(newWinner)).toBeGreaterThanOrEqual(toOrdinal(winner));
		},
	);

	// a team rating from few sets can be off from its players' average, either way
	const SCENARIOS = [
		{
			why: "opponents better than their team rating",
			winnerAverage: 25,
			loserAverage: 32,
		},
		{
			why: "opponents worse than their team rating",
			winnerAverage: 35,
			loserAverage: 15,
		},
	];

	test.each(SCENARIOS)(
		"a winning team gains at least as much as against either the opposing team or its players' average ($why)",
		({ winnerAverage, loserAverage }) => {
			const winner = settled(30);
			const loser = settled(20);

			const [[newWinner]] = rate(
				[[winner], [loser]],
				[[settled(winnerAverage)], [settled(loserAverage)]],
			);
			const [[againstTeam]] = rate([[winner], [loser]]);
			const [[againstAverage]] = rate([[winner], [settled(loserAverage)]]);

			expect(toOrdinal(newWinner)).toBeGreaterThanOrEqual(
				toOrdinal(againstTeam),
			);
			expect(toOrdinal(newWinner)).toBeGreaterThanOrEqual(
				toOrdinal(againstAverage),
			);
		},
	);

	test.each(SCENARIOS)(
		"a losing team loses no more than against either the winning team or its players' average ($why)",
		({ winnerAverage, loserAverage }) => {
			const winner = settled(30);
			const loser = settled(20);

			const [, [newLoser]] = rate(
				[[winner], [loser]],
				[[settled(winnerAverage)], [settled(loserAverage)]],
			);
			const [, [againstTeam]] = rate([[winner], [loser]]);
			const [, [againstAverage]] = rate([[settled(winnerAverage)], [loser]]);

			expect(toOrdinal(newLoser)).toBeGreaterThanOrEqual(
				toOrdinal(againstTeam),
			);
			expect(toOrdinal(newLoser)).toBeGreaterThanOrEqual(
				toOrdinal(againstAverage),
			);
		},
	);
});
