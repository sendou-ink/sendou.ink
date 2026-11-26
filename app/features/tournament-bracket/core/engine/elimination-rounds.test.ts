import { describe, expect, test } from "vitest";
import { createResolved } from "./create";
import {
	eliminationRoundCounts,
	losersRoundOfWinnersRound,
} from "./elimination-rounds";
import type { StageSettings } from "./types";

describe("eliminationRoundCounts", () => {
	test.each([
		{
			why: "two teams",
			type: "double_elimination",
			teamCount: 2,
			settings: {},
			expected: { winners: 1, losers: 0 },
		},
		{
			why: "eight teams",
			type: "double_elimination",
			teamCount: 8,
			settings: {},
			expected: { winners: 3, losers: 4 },
		},
		{
			why: "BYEs fill the first round",
			type: "double_elimination",
			teamCount: 5,
			settings: {},
			expected: { winners: 3, losers: 4 },
		},
		{
			why: "skipped rounds still count",
			type: "double_elimination",
			teamCount: 8,
			settings: { skippedRounds: ["WB_FINALS", "LB_SEMIS", "LB_FINALS"] },
			expected: { winners: 3, losers: 4 },
		},
	] as const)("$why", ({ type, teamCount, settings, expected }) => {
		const data = createResolved({
			type,
			seeding: Array.from({ length: teamCount }, (_, i) => i + 1),
			settings: settings as StageSettings,
		});

		expect(eliminationRoundCounts(data, data.group[0].id)).toEqual(expected);
	});

	test("counts the skipped rounds of single elimination", () => {
		const data = createResolved({
			type: "single_elimination",
			seeding: Array.from({ length: 16 }, (_, i) => i + 1),
			settings: { skippedRounds: ["SEMIS", "FINALS"] },
		});

		expect(eliminationRoundCounts(data, data.group[0].id).winners).toBe(4);
	});

	test("is 0 for a group without rounds", () => {
		const data = createResolved({
			type: "single_elimination",
			seeding: [1, 2, 3, 4],
			settings: {},
		});

		expect(eliminationRoundCounts(data, -1)).toEqual({ winners: 0, losers: 0 });
	});
});

describe("losersRoundOfWinnersRound", () => {
	test.each([
		{ winnersRound: 1, losersRound: 1 },
		{ winnersRound: 2, losersRound: 2 },
		{ winnersRound: 3, losersRound: 4 },
		{ winnersRound: 4, losersRound: 6 },
	])(
		"winners round $winnersRound drops to losers round $losersRound",
		({ winnersRound, losersRound }) => {
			expect(losersRoundOfWinnersRound(winnersRound)).toBe(losersRound);
		},
	);
});
