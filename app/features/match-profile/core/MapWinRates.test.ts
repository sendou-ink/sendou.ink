import { describe, expect, test } from "vitest";
import type { StageId } from "~/modules/in-game-lists/types";
import * as MapWinRates from "./MapWinRates";

const results: MapWinRates.MapResult[] = [
	{ mode: "SZ", stageId: 1, wins: 6, losses: 4 },
	{ mode: "SZ", stageId: 2, wins: 2, losses: 8 },
	{ mode: "SZ", stageId: 3, wins: 3, losses: 2 },
	{ mode: "SZ", stageId: 4, wins: 12, losses: 8 },
	{ mode: "TC", stageId: 1, wins: 10, losses: 0 },
];

describe("MapWinRates.record", () => {
	test("sums every stage of a mode", () => {
		expect(MapWinRates.record(results, { mode: "SZ" })).toEqual({
			wins: 23,
			losses: 22,
		});
	});

	test("picks one stage of a mode", () => {
		expect(MapWinRates.record(results, { mode: "TC", stageId: 1 })).toEqual({
			wins: 10,
			losses: 0,
		});
	});

	test("is empty for a stage without maps", () => {
		expect(MapWinRates.record(results, { mode: "RM", stageId: 1 })).toEqual({
			wins: 0,
			losses: 0,
		});
	});
});

describe("MapWinRates.rate", () => {
	test.each([
		{ why: "no maps", wins: 0, losses: 0, expected: null },
		{ why: "all wins", wins: 3, losses: 0, expected: 1 },
		{ why: "even", wins: 2, losses: 2, expected: 0.5 },
	])("$why", ({ wins, losses, expected }) => {
		expect(MapWinRates.rate({ wins, losses })).toBe(expected);
	});
});

describe("MapWinRates.isLowSample", () => {
	test.each([
		{ why: "no maps", wins: 0, losses: 0, expected: true },
		{ why: "just below the threshold", wins: 4, losses: 0, expected: true },
		{ why: "at the threshold", wins: 0, losses: 5, expected: false },
		{ why: "wins and losses summed", wins: 3, losses: 2, expected: false },
	])("$why", ({ wins, losses, expected }) => {
		expect(MapWinRates.isLowSample({ wins, losses })).toBe(expected);
	});
});

describe("MapWinRates.sortStages", () => {
	const stageIds: StageId[] = [0, 1, 2, 3, 4];

	test.each([
		{ order: "DEFAULT", expected: [0, 1, 2, 3, 4] },
		{ order: "BEST", expected: [4, 1, 3, 2, 0] },
		{ order: "WORST", expected: [2, 4, 1, 3, 0] },
	] as const)("$order", ({ order, expected }) => {
		expect(
			MapWinRates.sortStages({ stageIds, results, mode: "SZ", order }),
		).toEqual(expected);
	});
});

describe("MapWinRates.barSegment", () => {
	test.each([
		{
			why: "even",
			winRate: 0.5,
			expected: { startPercent: 50, widthPercent: 0 },
		},
		{
			why: "winning",
			winRate: 0.6,
			expected: { startPercent: 50, widthPercent: 20 },
		},
		{
			why: "losing",
			winRate: 0.4,
			expected: { startPercent: 30, widthPercent: 20 },
		},
		{
			why: "capped",
			winRate: 0.9,
			expected: { startPercent: 50, widthPercent: 50 },
		},
	])("$why", ({ winRate, expected }) => {
		const segment = MapWinRates.barSegment(winRate);

		expect(segment.startPercent).toBeCloseTo(expected.startPercent);
		expect(segment.widthPercent).toBeCloseTo(expected.widthPercent);
	});
});
