import { describe, expect, test } from "vitest";
import type { TeamPickSettings } from "~/db/tables-json";
import { MapPool } from "~/features/map-list-generator/core/map-pool";
import {
	BANNED_MAPS,
	SENDOUQ_MAP_POOL,
} from "~/features/match-profile/banned-maps";
import type { ModeShort, StageId } from "~/modules/in-game-lists/types";
import * as TeamPick from "./TeamPick";

const stages = (count: number) =>
	Array.from({ length: count }, (_, i) => i as StageId);

const uniformSettings = (
	modes: ModeShort[],
	count: number,
	pool: TeamPickSettings["pool"] = "SENDOUQ",
): TeamPickSettings => ({
	modes: modes.map((mode) => ({ mode, count })),
	pool,
});

const sameStagesPool = (modes: ModeShort[], stageCount: number) =>
	new MapPool({
		...MapPool.EMPTY.parsed,
		...Object.fromEntries(modes.map((mode) => [mode, stages(stageCount)])),
	});

describe("TeamPick.defaultCount", () => {
	test.each([
		{ modeCount: 1, expected: 6 },
		{ modeCount: 2, expected: 4 },
		{ modeCount: 3, expected: 3 },
		{ modeCount: 4, expected: 2 },
		{ modeCount: 5, expected: 2 },
	])("$modeCount modes -> $expected maps each", ({ modeCount, expected }) => {
		expect(TeamPick.defaultCount(modeCount)).toBe(expected);
	});
});

describe("TeamPick.defaultSettings", () => {
	test("sorts the modes in the in-game order with the SendouQ pool", () => {
		expect(TeamPick.defaultSettings(["CB", "TW", "SZ"])).toEqual({
			modes: [
				{ mode: "TW", count: 3 },
				{ mode: "SZ", count: 3 },
				{ mode: "CB", count: 3 },
			],
			pool: "SENDOUQ",
		});
	});
});

describe("TeamPick.effectivePool", () => {
	test("SendouQ pool limited to the picked modes", () => {
		const pool = TeamPick.effectivePool(uniformSettings(["SZ", "TC"], 2), []);

		expect(pool.parsed.SZ).toEqual(SENDOUQ_MAP_POOL.parsed.SZ);
		expect(pool.parsed.TC).toEqual(SENDOUQ_MAP_POOL.parsed.TC);
		expect(pool.parsed.RM).toEqual([]);
		expect(pool.parsed.TW).toEqual([]);
	});

	test("all maps includes Turf War and banned stages", () => {
		const pool = TeamPick.effectivePool(
			uniformSettings(["TW", "TC"], 2, "ALL"),
			[],
		);

		expect(pool.parsed.TW).toEqual(MapPool.ALL.parsed.TW);
		expect(pool.parsed.TC).toEqual(MapPool.ALL.parsed.TC);
		expect(pool.parsed.SZ).toEqual([]);
	});

	test("custom pool ignores maps of modes not picked", () => {
		const pool = TeamPick.effectivePool(uniformSettings(["SZ"], 2, "CUSTOM"), [
			{ mode: "SZ", stageId: 1 },
			{ mode: "TC", stageId: 2 },
		]);

		expect(pool.stageModePairs).toEqual([{ mode: "SZ", stageId: 1 }]);
	});
});

describe("TeamPick.stageRepeatCap", () => {
	test.each([
		{
			why: "4 modes × 2, SendouQ (today's default)",
			teamPick: uniformSettings(["SZ", "TC", "RM", "CB"], 2),
			pool: TeamPick.effectivePool(
				uniformSettings(["SZ", "TC", "RM", "CB"], 2),
				[],
			),
			expected: 2,
		},
		{
			why: "5 modes × 2, all maps",
			teamPick: uniformSettings(["TW", "SZ", "TC", "RM", "CB"], 2, "ALL"),
			pool: MapPool.ALL,
			expected: 2,
		},
		{
			why: "4 modes × 4, SendouQ",
			teamPick: uniformSettings(["SZ", "TC", "RM", "CB"], 4),
			pool: TeamPick.effectivePool(
				uniformSettings(["SZ", "TC", "RM", "CB"], 4),
				[],
			),
			expected: 2,
		},
		{
			why: "custom, 4 modes, same 12 stages each, × 4",
			teamPick: uniformSettings(["SZ", "TC", "RM", "CB"], 4, "CUSTOM"),
			pool: sameStagesPool(["SZ", "TC", "RM", "CB"], 12),
			expected: 2,
		},
		{
			why: "custom, 4 modes, same 8 stages each, × 4",
			teamPick: uniformSettings(["SZ", "TC", "RM", "CB"], 4, "CUSTOM"),
			pool: sameStagesPool(["SZ", "TC", "RM", "CB"], 8),
			expected: 3,
		},
		{
			why: "custom, 4 modes, same 6 stages each, × 4 (rule off)",
			teamPick: uniformSettings(["SZ", "TC", "RM", "CB"], 4, "CUSTOM"),
			pool: sameStagesPool(["SZ", "TC", "RM", "CB"], 6),
			expected: 4,
		},
		{
			why: "custom, 3 modes, same 5 stages each, × 3 (rule off)",
			teamPick: uniformSettings(["SZ", "TC", "RM"], 3, "CUSTOM"),
			pool: sameStagesPool(["SZ", "TC", "RM"], 5),
			expected: 3,
		},
		{
			why: "SZ × 6 + TC × 2, SendouQ (uneven counts)",
			teamPick: {
				modes: [
					{ mode: "SZ", count: 6 },
					{ mode: "TC", count: 2 },
				],
				pool: "SENDOUQ",
			} satisfies TeamPickSettings,
			pool: TeamPick.effectivePool(
				{
					modes: [
						{ mode: "SZ", count: 6 },
						{ mode: "TC", count: 2 },
					],
					pool: "SENDOUQ",
				},
				[],
			),
			expected: 2,
		},
		{
			why: "custom, SZ × 6 + TC × 6 + RM × 2, same 8 stages each",
			teamPick: {
				modes: [
					{ mode: "SZ", count: 6 },
					{ mode: "TC", count: 6 },
					{ mode: "RM", count: 2 },
				],
				pool: "CUSTOM",
			} satisfies TeamPickSettings,
			pool: sameStagesPool(["SZ", "TC", "RM"], 8),
			expected: 3,
		},
	])("$why -> $expected", ({ teamPick, pool, expected }) => {
		expect(TeamPick.stageRepeatCap({ teamPick, pool })).toBe(expected);
	});
});

describe("TeamPick.poolShortfalls", () => {
	test("names every mode with fewer stages than the count plus one", () => {
		const teamPick = uniformSettings(["SZ", "TC"], 3, "CUSTOM");
		const pool = new MapPool({
			...MapPool.EMPTY.parsed,
			SZ: stages(4),
			TC: stages(3),
		});

		expect(TeamPick.poolShortfalls(teamPick, pool)).toEqual([
			{ mode: "TC", required: 4, has: 3 },
		]);
	});
});

describe("TeamPick.maxCount", () => {
	test("one less than the pool has, at least 1", () => {
		const pool = new MapPool({ ...MapPool.EMPTY.parsed, SZ: stages(5) });

		expect(TeamPick.maxCount(pool, "SZ")).toBe(4);
		expect(TeamPick.maxCount(pool, "TC")).toBe(1);
	});
});

describe("TeamPick.validateTeamPool", () => {
	const teamPick = uniformSettings(["SZ", "TC"], 2);
	const pool = TeamPick.effectivePool(teamPick, []);
	const validate = (mapPool: MapPool) =>
		TeamPick.validateTeamPool({ mapPool, teamPick, pool });

	test.each([
		{
			why: "incomplete picks",
			mapPool: new MapPool([{ mode: "SZ", stageId: 1 }]),
			expected: "PICKING",
		},
		{
			why: "complete picks",
			mapPool: new MapPool([
				{ mode: "SZ", stageId: pool.parsed.SZ[0] },
				{ mode: "SZ", stageId: pool.parsed.SZ[1] },
				{ mode: "TC", stageId: pool.parsed.TC[0] },
				{ mode: "TC", stageId: pool.parsed.TC[1] },
			]),
			expected: "VALID",
		},
		{
			why: "picks of a mode not in the settings",
			mapPool: new MapPool([
				{ mode: "SZ", stageId: 1 },
				{ mode: "SZ", stageId: 2 },
				{ mode: "TC", stageId: 3 },
				{ mode: "RM", stageId: 4 },
			]),
			expected: "NOT_IN_POOL",
		},
		{
			why: "a banned map with the SendouQ pool",
			mapPool: new MapPool([
				{ mode: "SZ", stageId: 1 },
				{ mode: "TC", stageId: SENDOUQ_MAP_POOL.parsed.TC[0] },
				{ mode: "TC", stageId: BANNED_MAPS.TC[0] },
			]),
			expected: "NOT_IN_POOL",
		},
		{
			why: "a stage twice in one mode",
			mapPool: new MapPool([
				{ mode: "SZ", stageId: 1 },
				{ mode: "SZ", stageId: 1 },
			]),
			expected: "STAGE_REPEAT_IN_SAME_MODE",
		},
	])("$why -> $expected", ({ mapPool, expected }) => {
		expect(validate(mapPool)).toBe(expected);
	});

	test("a stage in more modes than the cap", () => {
		const threeModes = uniformSettings(["SZ", "TC", "RM"], 2);
		const threeModesPool = TeamPick.effectivePool(threeModes, []);
		const stageId = threeModesPool.parsed.RM.find(
			(candidate) =>
				threeModesPool.parsed.TC.includes(candidate) &&
				threeModesPool.parsed.SZ.includes(candidate),
		)!;

		expect(
			TeamPick.validateTeamPool({
				mapPool: new MapPool([
					{ mode: "SZ", stageId },
					{ mode: "TC", stageId },
					{ mode: "RM", stageId },
				]),
				teamPick: threeModes,
				pool: threeModesPool,
			}),
		).toBe("TOO_MUCH_STAGE_REPEAT");
	});
});
