import { describe, expect, it } from "vitest";
import type { Tables } from "~/db/tables";
import { MapPool } from "~/features/map-list-generator/core/map-pool";
import { stagesObj } from "~/modules/in-game-lists/stage-ids";
import type { StageId } from "~/modules/in-game-lists/types";
import { canUndo, generateNextMap, stats, unionPool } from "./ScrimMapByMap";

type MapRow = Pick<
	Tables["ScrimMap"],
	"index" | "mode" | "stageId" | "winnerSide" | "reportedAt"
>;

function makeMap(overrides: Partial<MapRow> & { index: number }): MapRow {
	return {
		index: overrides.index,
		mode: overrides.mode ?? "SZ",
		stageId: overrides.stageId ?? stagesObj.SCORCH_GORGE,
		winnerSide: overrides.winnerSide ?? null,
		reportedAt: overrides.reportedAt ?? null,
	};
}

describe("ScrimMapByMap.unionPool", () => {
	it("deduplicates stage-mode pairs across multiple lists", () => {
		const pool = unionPool([
			{
				mapList: [
					{ mode: "SZ", stageId: stagesObj.SCORCH_GORGE as StageId },
					{ mode: "SZ", stageId: stagesObj.EELTAIL_ALLEY as StageId },
				],
			},
			{
				mapList: [
					{ mode: "SZ", stageId: stagesObj.EELTAIL_ALLEY as StageId },
					{ mode: "SZ", stageId: stagesObj.MAKOMART as StageId },
				],
			},
		]);

		expect([...pool.parsed.SZ].sort((a, b) => a - b)).toEqual(
			[
				stagesObj.SCORCH_GORGE,
				stagesObj.EELTAIL_ALLEY,
				stagesObj.MAKOMART,
			].sort((a, b) => a - b),
		);
	});

	it("merges entries across modes", () => {
		const pool = unionPool([
			{
				mapList: [
					{ mode: "SZ", stageId: stagesObj.HAMMERHEAD_BRIDGE as StageId },
					{ mode: "TC", stageId: stagesObj.MAKOMART as StageId },
				],
			},
		]);

		expect(pool.parsed.SZ).toEqual([stagesObj.HAMMERHEAD_BRIDGE]);
		expect(pool.parsed.TC).toEqual([stagesObj.MAKOMART]);
	});
});

describe("ScrimMapByMap.generateNextMap", () => {
	it("avoids the just-played stage when alternatives exist", () => {
		const pool = new MapPool({
			SZ: [stagesObj.SCORCH_GORGE, stagesObj.MAKOMART, stagesObj.WAHOO_WORLD],
			TC: [],
			CB: [],
			RM: [],
			TW: [],
		});

		for (let i = 0; i < 25; i++) {
			const next = generateNextMap({
				pool,
				history: [{ mode: "SZ", stageId: stagesObj.SCORCH_GORGE }],
			});
			expect(next.stageId).not.toBe(stagesObj.SCORCH_GORGE);
		}
	});

	it("advances from the last played mode when a mode was replayed", () => {
		const pool = new MapPool({
			SZ: [stagesObj.SCORCH_GORGE, stagesObj.MAKOMART],
			TC: [stagesObj.HAMMERHEAD_BRIDGE],
			RM: [stagesObj.WAHOO_WORLD],
			CB: [stagesObj.EELTAIL_ALLEY],
			TW: [],
		});

		const next = generateNextMap({
			pool,
			history: [
				{ mode: "SZ", stageId: stagesObj.SCORCH_GORGE },
				{ mode: "SZ", stageId: stagesObj.MAKOMART },
			],
		});

		expect(next.mode).toBe("TC");
	});

	it("can still generate when only one stage is available", () => {
		const pool = new MapPool({
			SZ: [stagesObj.SCORCH_GORGE],
			TC: [],
			CB: [],
			RM: [],
			TW: [],
		});

		const next = generateNextMap({ pool, history: [] });
		expect(next).toEqual({ mode: "SZ", stageId: stagesObj.SCORCH_GORGE });
	});
});

describe("ScrimMapByMap.canUndo", () => {
	it("returns true for the most recent reported map", () => {
		const history = [
			makeMap({ index: 0, reportedAt: 100 }),
			makeMap({ index: 1, reportedAt: 200 }),
		];

		expect(canUndo(history[1], history)).toBe(true);
	});

	it("returns false for unreported maps", () => {
		const history = [makeMap({ index: 0, reportedAt: null })];
		expect(canUndo(history[0], history)).toBe(false);
	});

	it("returns false for a non-latest reported map", () => {
		const history = [
			makeMap({ index: 0, reportedAt: 100 }),
			makeMap({ index: 1, reportedAt: 200 }),
		];
		expect(canUndo(history[0], history)).toBe(false);
	});

	it("returns false when given undefined", () => {
		expect(canUndo(undefined, [])).toBe(false);
	});

	it("returns true when an unreported next map exists after the latest reported", () => {
		const history = [
			makeMap({ index: 0, reportedAt: 100 }),
			makeMap({ index: 1, reportedAt: 200 }),
			makeMap({ index: 2, reportedAt: null }),
		];

		expect(canUndo(history[1], history)).toBe(true);
	});
});

describe("ScrimMapByMap.stats", () => {
	const history: MapRow[] = [
		makeMap({
			index: 0,
			mode: "SZ",
			stageId: stagesObj.SCORCH_GORGE,
			winnerSide: "ALPHA",
			reportedAt: 100,
		}),
		makeMap({
			index: 1,
			mode: "SZ",
			stageId: stagesObj.MAKOMART,
			winnerSide: "BRAVO",
			reportedAt: 200,
		}),
		makeMap({
			index: 2,
			mode: "TC",
			stageId: stagesObj.MAKOMART,
			winnerSide: "ALPHA",
			reportedAt: 300,
		}),
		makeMap({
			index: 3,
			mode: "SZ",
			stageId: stagesObj.SCORCH_GORGE,
			winnerSide: null,
			reportedAt: null,
		}),
	];

	it("aggregates wins/losses from the viewer's perspective", () => {
		const result = stats(history, "ALPHA");

		const szMode = result.byMode.find((r) => r.key === "SZ");
		expect(szMode).toEqual({ key: "SZ", wins: 1, losses: 1 });

		const tcMode = result.byMode.find((r) => r.key === "TC");
		expect(tcMode).toEqual({ key: "TC", wins: 1, losses: 0 });
	});

	it("flips wins/losses when viewing as BRAVO", () => {
		const result = stats(history, "BRAVO");

		const szMode = result.byMode.find((r) => r.key === "SZ");
		expect(szMode).toEqual({ key: "SZ", wins: 1, losses: 1 });

		const tcMode = result.byMode.find((r) => r.key === "TC");
		expect(tcMode).toEqual({ key: "TC", wins: 0, losses: 1 });
	});

	it("filters out empty rows", () => {
		const result = stats(history, "ALPHA");
		for (const row of result.byMode) {
			expect(row.wins + row.losses).toBeGreaterThan(0);
		}
	});

	it("respects restrictToPool", () => {
		const restrictToPool = new MapPool({
			SZ: [stagesObj.SCORCH_GORGE],
			TC: [],
			CB: [],
			RM: [],
			TW: [],
		});

		const result = stats(history, "ALPHA", { restrictToPool });
		expect(result.byMode).toEqual([{ key: "SZ", wins: 1, losses: 0 }]);
	});
});
