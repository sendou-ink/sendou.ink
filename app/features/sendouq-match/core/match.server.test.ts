import { describe, expect, test } from "vitest";
import * as Test from "~/utils/Test";
import {
	mapModePreferencesToModeList,
	normalizeAndCombineWeights,
} from "./match.server";

describe("mapModePreferencesToModeList()", () => {
	test("returns default list if no preferences", () => {
		const modeList = mapModePreferencesToModeList([], []);

		expect(
			Test.arrayContainsSameItems(["SZ", "TC", "RM", "CB"], modeList),
		).toBe(true);
	});

	test("returns default list if equally disliking everything", () => {
		const dislikingEverything = [
			{ mode: "TW", preference: "AVOID" } as const,
			{ mode: "SZ", preference: "AVOID" } as const,
			{ mode: "TC", preference: "AVOID" } as const,
			{ mode: "RM", preference: "AVOID" } as const,
			{ mode: "CB", preference: "AVOID" } as const,
		];

		const modeList = mapModePreferencesToModeList(
			[
				dislikingEverything,
				dislikingEverything,
				dislikingEverything,
				dislikingEverything,
			],
			[
				dislikingEverything,
				dislikingEverything,
				dislikingEverything,
				dislikingEverything,
			],
		);

		expect(
			Test.arrayContainsSameItems(["SZ", "TC", "RM", "CB"], modeList),
		).toBe(true);
	});

	test("if positive about nothing, choose the most liked (-TW)", () => {
		const modeList = mapModePreferencesToModeList(
			[[{ mode: "SZ", preference: "AVOID" }]],
			[],
		);

		expect(Test.arrayContainsSameItems(["TC", "RM", "CB"], modeList)).toBe(
			true,
		);
	});

	test("only turf war possible to get if least bad option", () => {
		const modeList = mapModePreferencesToModeList(
			[
				[
					{ mode: "SZ", preference: "AVOID" },
					{ mode: "TC", preference: "AVOID" },
					{ mode: "RM", preference: "AVOID" },
					{ mode: "CB", preference: "AVOID" },
					{ mode: "TW", preference: "AVOID" },
				],
				[{ mode: "TW", preference: "PREFER" }],
			],
			[],
		);

		expect(Test.arrayContainsSameItems(["TW"], modeList)).toBe(true);
	});

	test("team votes for their preference", () => {
		const modeList = mapModePreferencesToModeList(
			[
				[
					{ mode: "SZ", preference: "PREFER" },
					{ mode: "TC", preference: "PREFER" },
				],
				[{ mode: "TC", preference: "PREFER" }],
				[{ mode: "TC", preference: "AVOID" }],
				[{ mode: "TC", preference: "PREFER" }],
			],
			[
				[{ mode: "TC", preference: "PREFER" }],
				[{ mode: "TC", preference: "PREFER" }],
				[{ mode: "TC", preference: "AVOID" }],
				[{ mode: "TC", preference: "AVOID" }],
			],
		);

		expect(Test.arrayContainsSameItems(["SZ", "TC"], modeList)).toBe(true);
	});

	test("favorite ranked mode sorted first in the array", () => {
		expect(
			mapModePreferencesToModeList(
				[[{ mode: "TC", preference: "PREFER" }]],
				[],
			)[0],
		).toBe("TC");
	});

	test("includes turf war if more prefer than want to avoid", () => {
		const modeList = mapModePreferencesToModeList(
			[[{ mode: "TW", preference: "PREFER" }]],
			[[{ mode: "SZ", preference: "PREFER" }]],
		);

		expect(Test.arrayContainsSameItems(["TW", "SZ"], modeList)).toBe(true);
	});

	test("doesn't include turf war if mixed", () => {
		const modeList = mapModePreferencesToModeList(
			[[{ mode: "TW", preference: "PREFER" }]],
			[[{ mode: "TW", preference: "AVOID" }]],
		);

		expect(
			Test.arrayContainsSameItems(["SZ", "TC", "RM", "CB"], modeList),
		).toBe(true);
	});
});

describe("normalizeAndCombineWeights()", () => {
	test("normalizes and combines weights when both teams have weights", () => {
		const teamOneWeights = new Map([
			["map1-SZ", 100],
			["map2-TC", 50],
		]);
		const teamTwoWeights = new Map([
			["map1-SZ", 200],
			["map2-TC", 100],
		]);

		const result = normalizeAndCombineWeights(teamOneWeights, teamTwoWeights);

		expect(result.get("map1-SZ")).toBe(400);
		expect(result.get("map2-TC")).toBe(200);
	});

	test("normalizes correctly when team totals differ", () => {
		const teamOneWeights = new Map([["map1-SZ", 100]]);
		const teamTwoWeights = new Map([["map1-SZ", 50]]);

		const result = normalizeAndCombineWeights(teamOneWeights, teamTwoWeights);

		expect(result.get("map1-SZ")).toBe(100);
	});

	test("includes all keys from both teams", () => {
		const teamOneWeights = new Map([
			["map1-SZ", 100],
			["map2-TC", 50],
		]);
		const teamTwoWeights = new Map([
			["map1-SZ", 100],
			["map3-RM", 50],
		]);

		const result = normalizeAndCombineWeights(teamOneWeights, teamTwoWeights);

		expect(result.has("map1-SZ")).toBe(true);
		expect(result.has("map2-TC")).toBe(true);
		expect(result.has("map3-RM")).toBe(true);
		expect(result.size).toBe(3);
	});

	test("handles team one having zero weights", () => {
		const teamOneWeights = new Map<string, number>();
		const teamTwoWeights = new Map([["map1-SZ", 100]]);

		const result = normalizeAndCombineWeights(teamOneWeights, teamTwoWeights);

		expect(result.get("map1-SZ")).toBe(100);
	});

	test("handles team two having zero weights", () => {
		const teamOneWeights = new Map([["map1-SZ", 100]]);
		const teamTwoWeights = new Map<string, number>();

		const result = normalizeAndCombineWeights(teamOneWeights, teamTwoWeights);

		expect(result.get("map1-SZ")).toBe(100);
	});

	test("handles both teams having zero weights", () => {
		const teamOneWeights = new Map<string, number>();
		const teamTwoWeights = new Map<string, number>();

		const result = normalizeAndCombineWeights(teamOneWeights, teamTwoWeights);

		expect(result.size).toBe(0);
	});

	test("handles keys present in one team but not the other", () => {
		const teamOneWeights = new Map([["map1-SZ", 100]]);
		const teamTwoWeights = new Map([["map2-TC", 200]]);

		const result = normalizeAndCombineWeights(teamOneWeights, teamTwoWeights);

		expect(result.get("map1-SZ")).toBe(200);
		expect(result.get("map2-TC")).toBe(200);
	});

	test("normalizes team one weight proportionally to team two total", () => {
		const teamOneWeights = new Map([["map1-SZ", 40]]);
		const teamTwoWeights = new Map([
			["map1-SZ", 60],
			["map2-TC", 40],
		]);

		const result = normalizeAndCombineWeights(teamOneWeights, teamTwoWeights);

		expect(result.get("map1-SZ")).toBe(160);
		expect(result.get("map2-TC")).toBe(40);
	});
});
