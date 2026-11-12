import { describe, expect, test } from "vitest";
import * as Tiebreakers from "./Tiebreakers";

const statsWith = (
	overrides: Partial<Parameters<typeof Tiebreakers.compare>[1]>,
): Parameters<typeof Tiebreakers.compare>[1] => ({
	setWins: 2,
	setLosses: 1,
	mapWins: 4,
	mapLosses: 2,
	winsAgainstTied: 0,
	...overrides,
});

describe("Tiebreakers.compare", () => {
	test.each([
		{ name: "ROUND_ROBIN", tiebreakers: Tiebreakers.ROUND_ROBIN },
		{ name: "SWISS", tiebreakers: Tiebreakers.SWISS },
	])("$name ranks more map wins above fewer map losses", ({ tiebreakers }) => {
		const moreMapWins = statsWith({ mapWins: 5, mapLosses: 3 });
		const fewerMapLosses = statsWith({ mapWins: 4, mapLosses: 1 });

		expect(
			Tiebreakers.compare(tiebreakers, moreMapWins, fewerMapLosses),
		).toBeLessThan(0);
	});
});

describe("Tiebreakers.SWISS", () => {
	test.each([
		{
			label: "TB",
			why: "losses against tied as a negative number",
			stats: statsWith({ lossesAgainstTied: 2 }),
			expected: "-2",
		},
		{
			label: "OW%",
			why: "the opponents' set win percentage with two decimals",
			stats: statsWith({ opponentSetWinPercentage: 0.5 }),
			expected: "0.50",
		},
		{
			label: "OW%",
			why: "nothing for a missing opponents' set win percentage",
			stats: statsWith({}),
			expected: "",
		},
		{
			label: "OW% (M)",
			why: "the opponents' map win percentage with two decimals",
			stats: statsWith({ opponentMapWinPercentage: 0.6667 }),
			expected: "0.67",
		},
	])("the $label column shows $why", ({ label, stats, expected }) => {
		const tiebreaker = Tiebreakers.SWISS.find(
			(candidate) => candidate.label === label,
		)!;

		expect(tiebreaker.format(stats)).toBe(expected);
	});
});
