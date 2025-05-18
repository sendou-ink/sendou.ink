import { describe, expect, test } from "vitest";
import type { UserMapModePreferences } from "~/db/tables";
import type { StageId } from "~/modules/in-game-lists";
import { rankedModesShort } from "~/modules/in-game-lists/modes";
import { SENDOUQ_DEFAULT_MAPS } from "~/modules/tournament-map-list-generator/constants";
import * as Test from "~/utils/Test";
import { nullFilledArray } from "~/utils/arrays";
import { mapLottery, mapModePreferencesToModeList } from "./match.server";

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

const MODES_COUNT = 4;
const STAGES_PER_MODE = 7;

describe("mapLottery()", () => {
	test("returns maps even if no preferences", () => {
		const mapPool = mapLottery([], rankedModesShort);

		expect(mapPool.stageModePairs.length).toBe(STAGES_PER_MODE * MODES_COUNT);
	});

	test("returns some maps from the map pools", () => {
		const memberOnePool: UserMapModePreferences["pool"] = rankedModesShort.map(
			(mode) => ({
				mode,
				stages: nullFilledArray(7).map((_, i) => (i + 1) as StageId),
			}),
		);
		const memberTwoPool: UserMapModePreferences["pool"] = rankedModesShort.map(
			(mode) => ({
				mode,
				stages: nullFilledArray(7).map((_, i) => (i + 10) as StageId),
			}),
		);

		const pool = mapLottery(
			[
				{ modes: [], pool: memberOnePool },
				{ modes: [], pool: memberTwoPool },
			],
			rankedModesShort,
		);

		expect(pool.stageModePairs.some((p) => p.stageId <= 7)).toBe(true);
		expect(pool.stageModePairs.some((p) => p.stageId > 10)).toBe(true);
	});

	test("includes modes that were given and nothing else", () => {
		const memberOnePool: UserMapModePreferences["pool"] = rankedModesShort.map(
			(mode) => ({
				mode,
				stages: nullFilledArray(7).map((_, i) => (i + 1) as StageId),
			}),
		);

		const pool = mapLottery([{ modes: [], pool: memberOnePool }], ["SZ", "TC"]);

		expect(
			pool.stageModePairs.every((p) => p.mode === "SZ" || p.mode === "TC"),
		).toBe(true);
	});

	test("excludes map preferences if mode is avoided", () => {
		const memberOnePool: UserMapModePreferences["pool"] = [
			{
				mode: "SZ",
				stages: nullFilledArray(7).map((_, i) => (i + 1) as StageId),
			},
		];

		const pool = mapLottery(
			[{ modes: [{ preference: "AVOID", mode: "SZ" }], pool: memberOnePool }],
			["SZ"],
		);

		expect(
			pool.stageModePairs.every((p) =>
				SENDOUQ_DEFAULT_MAPS.SZ.some((stageId) => stageId === p.stageId),
			),
		).toBe(true);
	});
});
