import { afterEach, describe, expect, test, vi } from "vitest";
import type { StageId } from "~/modules/in-game-lists/types";
import * as Test from "~/utils/Test";
import {
	mapModePreferencesToModeList,
	matchMapList,
	normalizeAndCombineWeights,
} from "./match.server";

vi.mock("~/features/sendouq/core/default-maps.server", () => ({
	getDefaultMapWeights: vi.fn(),
}));

import { getDefaultMapWeights } from "~/features/sendouq/core/default-maps.server";
import { SENDOUQ_BEST_OF } from "~/features/sendouq/q-constants";

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

describe("matchMapList()", () => {
	afterEach(() => {
		vi.clearAllMocks();
	});

	test("maps not in team preferences or defaults should not be preferred over default maps", async () => {
		// Note stage 23 (Lemuria Hub) is NOT in defaults
		const defaultStageIds: StageId[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

		const mockDefaults = new Map<string, number>();

		for (const stageId of defaultStageIds) {
			mockDefaults.set(`SZ-${stageId}`, -1);
		}

		vi.mocked(getDefaultMapWeights).mockResolvedValue(mockDefaults);

		// Both teams have empty preferences (no map pools set)
		// This forces the system to rely entirely on defaults
		const emptyPreferences = {
			modes: [{ mode: "SZ" as const, preference: "PREFER" as const }],
			pool: [],
		};

		const result = await matchMapList(
			{
				preferences: [{ userId: 1, preferences: emptyPreferences }],
				id: 1,
			},
			{
				preferences: [{ userId: 2, preferences: emptyPreferences }],
				id: 2,
			},
			["SZ"],
		);

		const szMaps = result.filter((m) => m.mode === "SZ");

		for (const map of szMaps) {
			expect(defaultStageIds).toContain(map.stageId);
		}
	});

	test("user selected maps should be preferred over default maps even with small pool", async () => {
		// User selected stages - just 7 stages per mode (less than half of 25)
		// Note: stages 1 (EELTAIL_ALLEY) and 9 (STURGEON_SHIPYARD) are banned for SZ
		const userSelectedStageIds: StageId[] = [0, 2, 3, 4, 5, 6, 7];

		// Default stages include many more maps that users did NOT select
		const defaultStageIds: StageId[] = [
			8, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20,
		];

		const mockDefaults = new Map<string, number>();
		for (const stageId of defaultStageIds) {
			mockDefaults.set(`SZ-${stageId}`, -SENDOUQ_BEST_OF);
		}

		vi.mocked(getDefaultMapWeights).mockResolvedValue(mockDefaults);

		// Both teams have selected the same 5 stages
		const teamPreferences = {
			modes: [{ mode: "SZ" as const, preference: "PREFER" as const }],
			pool: [
				{
					mode: "SZ" as const,
					stages: userSelectedStageIds,
				},
			],
		};

		const result = await matchMapList(
			{
				preferences: [
					{ userId: 1, preferences: teamPreferences },
					{ userId: 2, preferences: teamPreferences },
					{ userId: 3, preferences: teamPreferences },
					{ userId: 4, preferences: teamPreferences },
				],
				id: 1,
			},
			{
				preferences: [
					{ userId: 5, preferences: teamPreferences },
					{ userId: 6, preferences: teamPreferences },
					{ userId: 7, preferences: teamPreferences },
					{ userId: 8, preferences: teamPreferences },
				],
				id: 2,
			},
			["SZ"],
		);

		const szMaps = result.filter((m) => m.mode === "SZ");

		// All selected maps should come from user preferences, not defaults
		for (const map of szMaps) {
			expect(userSelectedStageIds).toContain(map.stageId);
		}
	});
});
