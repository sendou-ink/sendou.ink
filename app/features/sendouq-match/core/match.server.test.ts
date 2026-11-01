import { afterEach, describe, expect, test, vi } from "vitest";
import { getDefaultMapWeights } from "~/features/sendouq/core/default-maps.server";
import { SENDOUQ_BEST_OF } from "~/features/sendouq/q-constants";
import type { StageId } from "~/modules/in-game-lists/types";
import { matchMapList, normalizeAndCombineWeights } from "./match.server";

vi.mock("~/features/sendouq/core/default-maps.server", () => ({
	getDefaultMapWeights: vi.fn(),
}));

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

		// empty preferences force the system to rely entirely on defaults
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
			SENDOUQ_BEST_OF,
		);

		const szMaps = result.filter((m) => m.mode === "SZ");

		for (const map of szMaps) {
			expect(defaultStageIds).toContain(map.stageId);
		}
	});

	test("user selected maps should be preferred over default maps even with small pool", async () => {
		// 7 stages per mode (less than half of 25); stages 1 (EELTAIL_ALLEY) and 9 (STURGEON_SHIPYARD) are banned for SZ
		const userSelectedStageIds: StageId[] = [0, 2, 3, 4, 5, 6, 7];

		const defaultStageIds: StageId[] = [
			8, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20,
		];

		const mockDefaults = new Map<string, number>();
		for (const stageId of defaultStageIds) {
			mockDefaults.set(`SZ-${stageId}`, -SENDOUQ_BEST_OF);
		}

		vi.mocked(getDefaultMapWeights).mockResolvedValue(mockDefaults);

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
			SENDOUQ_BEST_OF,
		);

		const szMaps = result.filter((m) => m.mode === "SZ");

		for (const map of szMaps) {
			expect(userSelectedStageIds).toContain(map.stageId);
		}
	});

	test("teams alternate picking maps", async () => {
		vi.mocked(getDefaultMapWeights).mockResolvedValue(new Map());

		for (let i = 0; i < 20; i++) {
			const result = await matchMapList(
				szGroup(1, [0, 2, 3, 4, 5, 6, 7]),
				szGroup(2, [8, 10, 11, 12, 13, 14, 15]),
				["SZ"],
				SENDOUQ_BEST_OF,
			);

			const sources = result.map((m) => m.source);
			expect(sources[0]).not.toBe(sources[1]);
			expect(sources).toEqual(sources.map((_, idx) => sources[idx % 2]));
		}
	});

	test("includes the map both teams voted for", async () => {
		vi.mocked(getDefaultMapWeights).mockResolvedValue(new Map());

		for (let i = 0; i < 20; i++) {
			const result = await matchMapList(
				szGroup(1, [0, 2, 3, 4, 5, 6, 7]),
				szGroup(2, [7, 8, 10, 11, 12, 13, 14]),
				["SZ"],
				SENDOUQ_BEST_OF,
			);

			expect(result.map((m) => m.stageId)).toContain(7);
		}
	});

	test("maps played before come up less often", async () => {
		vi.mocked(getDefaultMapWeights).mockResolvedValue(new Map());
		const playedMap = { mode: "SZ" as const, stageId: 0 as const };

		let playedMapCount = 0;
		for (let i = 0; i < 100; i++) {
			const [map] = await matchMapList(
				szGroup(1, [0, 2]),
				szGroup(2, [0, 2]),
				["SZ"],
				1,
				[playedMap, playedMap],
			);
			if (map.stageId === playedMap.stageId) playedMapCount++;
		}

		expect(playedMapCount).toBeLessThan(25);
	});

	test("plays only on the other team's maps when a team has no pool", async () => {
		const otherTeamStageIds: StageId[] = [8, 10, 11, 12, 13, 14, 15];
		vi.mocked(getDefaultMapWeights).mockResolvedValue(
			new Map([
				["SZ-0", -SENDOUQ_BEST_OF],
				["SZ-2", -SENDOUQ_BEST_OF],
			]),
		);

		for (let i = 0; i < 20; i++) {
			const result = await matchMapList(
				szGroup(1, []),
				szGroup(2, otherTeamStageIds),
				["SZ"],
				SENDOUQ_BEST_OF,
			);

			for (const map of result) {
				expect(otherTeamStageIds).toContain(map.stageId);
			}
		}
	});
});

function szGroup(id: number, stages: StageId[]) {
	const preferences = {
		modes: [{ mode: "SZ" as const, preference: "PREFER" as const }],
		pool: stages.length > 0 ? [{ mode: "SZ" as const, stages }] : [],
	};

	return {
		id,
		preferences: [1, 2, 3, 4].map((member) => ({
			userId: id * 10 + member,
			preferences,
		})),
	};
}
