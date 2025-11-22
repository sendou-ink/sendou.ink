import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { db } from "~/db/sql";
import type { UserMapModePreferences } from "~/db/tables";
import type { StageId } from "~/modules/in-game-lists/types";
import { dbInsertUsers, dbReset } from "~/utils/Test";
import { SENDOUQ_BEST_OF } from "../q-constants";
import {
	clearCacheForTesting,
	getDefaultMapWeights,
} from "./default-maps.server";

const { mockSeasonCurrent, mockSeasonPrevious } = vi.hoisted(() => ({
	mockSeasonCurrent: vi.fn(),
	mockSeasonPrevious: vi.fn(),
}));

vi.mock("~/features/mmr/core/Seasons", () => ({
	current: mockSeasonCurrent,
	previous: mockSeasonPrevious,
}));

describe("getDefaultMapWeights()", () => {
	beforeEach(async () => {
		vi.clearAllMocks();
		clearCacheForTesting();
		await dbInsertUsers(10);
	});

	afterEach(() => {
		vi.restoreAllMocks();
		dbReset();
	});

	test("returns empty map when no season is found", async () => {
		mockSeasonCurrent.mockReturnValue(null);
		mockSeasonPrevious.mockReturnValue(null);

		const result = await getDefaultMapWeights();

		expect(result).toBeInstanceOf(Map);
		expect(result.size).toBe(0);
	});

	test("uses previous season when current season is less than 7 days old", async () => {
		const yesterday = new Date();
		yesterday.setDate(yesterday.getDate() - 1);

		mockSeasonCurrent.mockReturnValue({
			nth: 2,
			starts: yesterday,
			ends: new Date("2030-12-31"),
		});
		mockSeasonPrevious.mockReturnValue({
			nth: 1,
			starts: new Date("2023-01-01"),
			ends: new Date("2023-12-31"),
		});

		await insertUserMapModePreferencesForSeason({
			seasonNth: 1,
			userPreferences: [
				{
					userId: 1,
					mapModePreferences: {
						modes: [],
						pool: [{ mode: "SZ", stages: [0] }],
					},
				},
			],
		});

		const result = await getDefaultMapWeights();

		expect(result.size).toBeGreaterThan(0);
	});

	test("uses current season when it is 7 or more days old", async () => {
		const eightDaysAgo = new Date();
		eightDaysAgo.setDate(eightDaysAgo.getDate() - 8);

		mockSeasonCurrent.mockReturnValue({
			nth: 2,
			starts: eightDaysAgo,
			ends: new Date("2030-12-31"),
		});
		mockSeasonPrevious.mockReturnValue({
			nth: 1,
			starts: new Date("2023-01-01"),
			ends: new Date("2023-12-31"),
		});

		await insertUserMapModePreferencesForSeason({
			seasonNth: 2,
			userPreferences: [
				{
					userId: 1,
					mapModePreferences: {
						modes: [],
						pool: [{ mode: "SZ", stages: [0] }],
					},
				},
			],
		});

		const result = await getDefaultMapWeights();

		expect(result.size).toBeGreaterThan(0);
	});

	test("uses previous season when current season does not exist", async () => {
		mockSeasonCurrent.mockReturnValue(null);
		mockSeasonPrevious.mockReturnValue({
			nth: 1,
			starts: new Date("2023-01-01"),
			ends: new Date("2023-12-31"),
		});

		await insertUserMapModePreferencesForSeason({
			seasonNth: 1,
			userPreferences: [
				{
					userId: 1,
					mapModePreferences: {
						modes: [],
						pool: [{ mode: "SZ", stages: [0] }],
					},
				},
			],
		});

		const result = await getDefaultMapWeights();

		expect(result.size).toBeGreaterThan(0);
	});

	test("returns weights for top 7 maps per mode", async () => {
		mockSeasonCurrent.mockReturnValue({
			nth: 1,
			starts: new Date("2023-01-01"),
			ends: new Date("2023-12-31"),
		});

		await insertUserMapModePreferencesForSeason({
			seasonNth: 1,
			userPreferences: [
				{
					userId: 1,
					mapModePreferences: {
						modes: [],
						pool: [
							{ mode: "SZ", stages: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10] },
							{ mode: "TC", stages: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10] },
						],
					},
				},
				{
					userId: 2,
					mapModePreferences: {
						modes: [],
						pool: [
							{ mode: "SZ", stages: [0, 1, 2, 3, 4, 5, 6] },
							{ mode: "TC", stages: [1, 2, 3, 4, 5, 6, 7] },
						],
					},
				},
			],
		});

		const result = await getDefaultMapWeights();

		const szMaps = Array.from(result.keys()).filter((key) =>
			key.startsWith("SZ-"),
		);
		const tcMaps = Array.from(result.keys()).filter((key) =>
			key.startsWith("TC-"),
		);

		expect(szMaps.length).toBe(7);
		expect(tcMaps.length).toBe(7);
	});

	test("assigns weight of -SENDOUQ_BEST_OF to all selected maps", async () => {
		mockSeasonCurrent.mockReturnValue({
			nth: 1,
			starts: new Date("2023-01-01"),
			ends: new Date("2023-12-31"),
		});

		await insertUserMapModePreferencesForSeason({
			seasonNth: 1,
			userPreferences: [
				{
					userId: 1,
					mapModePreferences: {
						modes: [],
						pool: [{ mode: "SZ", stages: [0, 1, 2] }],
					},
				},
			],
		});

		const result = await getDefaultMapWeights();

		for (const weight of result.values()) {
			expect(weight).toBe(-SENDOUQ_BEST_OF);
		}
	});

	test("does not count preferences for avoided modes", async () => {
		mockSeasonCurrent.mockReturnValue({
			nth: 1,
			starts: new Date("2023-01-01"),
			ends: new Date("2023-12-31"),
		});

		await insertUserMapModePreferencesForSeason({
			seasonNth: 1,
			userPreferences: [
				{
					userId: 1,
					mapModePreferences: {
						modes: [{ mode: "SZ", preference: "AVOID" }],
						pool: [
							{ mode: "SZ", stages: [0, 1, 2] },
							{ mode: "TC", stages: [0, 1, 2] },
						],
					},
				},
				{
					userId: 2,
					mapModePreferences: {
						modes: [{ mode: "SZ", preference: "AVOID" }],
						pool: [
							{ mode: "SZ", stages: [0, 1, 2] },
							{ mode: "TC", stages: [0, 1, 2] },
						],
					},
				},
				{
					userId: 3,
					mapModePreferences: {
						modes: [],
						pool: [
							{ mode: "SZ", stages: [3, 4, 5] },
							{ mode: "TC", stages: [0, 1, 2] },
						],
					},
				},
			],
		});

		const result = await getDefaultMapWeights();

		const szMaps = Array.from(result.keys()).filter((key) =>
			key.startsWith("SZ-"),
		);
		const tcMaps = Array.from(result.keys()).filter((key) =>
			key.startsWith("TC-"),
		);

		expect(tcMaps.length).toBe(3);
		expect(szMaps.length).toBe(3);
	});

	test("handles users with no pool preferences", async () => {
		mockSeasonCurrent.mockReturnValue({
			nth: 1,
			starts: new Date("2023-01-01"),
			ends: new Date("2023-12-31"),
		});

		await insertUserMapModePreferencesForSeason({
			seasonNth: 1,
			userPreferences: [
				{
					userId: 1,
					mapModePreferences: {
						modes: [],
						pool: undefined as any,
					},
				},
				{
					userId: 2,
					mapModePreferences: {
						modes: [],
						pool: [{ mode: "SZ", stages: [0, 1, 2] }],
					},
				},
			],
		});

		const result = await getDefaultMapWeights();

		expect(result.size).toBeGreaterThan(0);
	});

	test("selects most popular maps across users", async () => {
		mockSeasonCurrent.mockReturnValue({
			nth: 1,
			starts: new Date("2023-01-01"),
			ends: new Date("2023-12-31"),
		});

		const FROM_ZERO_TO_SIX = Array.from({ length: 7 }, (_, i) => i as StageId);

		await insertUserMapModePreferencesForSeason({
			seasonNth: 1,
			userPreferences: [
				{
					userId: 1,
					mapModePreferences: {
						modes: [
							{
								mode: "SZ",
								preference: "PREFER",
							},
						],
						pool: [{ mode: "SZ", stages: [1, 2, 3, 4, 5, 6, 7] }],
					},
				},
				{
					userId: 2,
					mapModePreferences: {
						modes: [
							{
								mode: "SZ",
								preference: "PREFER",
							},
						],
						pool: [{ mode: "SZ", stages: FROM_ZERO_TO_SIX }],
					},
				},
				{
					userId: 3,
					mapModePreferences: {
						modes: [
							{
								mode: "SZ",
								preference: "PREFER",
							},
						],
						pool: [{ mode: "SZ", stages: FROM_ZERO_TO_SIX }],
					},
				},
			],
		});

		const result = await getDefaultMapWeights();

		expect(result.has("SZ-0")).toBe(true);
		expect(result.has("SZ-7")).toBe(false);
	});

	test("handles empty preferences array", async () => {
		mockSeasonCurrent.mockReturnValue({
			nth: 1,
			starts: new Date("2023-01-01"),
			ends: new Date("2023-12-31"),
		});

		const result = await getDefaultMapWeights();

		expect(result).toBeInstanceOf(Map);
		expect(result.size).toBe(0);
	});

	test("processes all ranked modes (SZ, TC, RM, CB)", async () => {
		mockSeasonCurrent.mockReturnValue({
			nth: 1,
			starts: new Date("2023-01-01"),
			ends: new Date("2023-12-31"),
		});

		await insertUserMapModePreferencesForSeason({
			seasonNth: 1,
			userPreferences: [
				{
					userId: 1,
					mapModePreferences: {
						modes: [],
						pool: [
							{ mode: "SZ", stages: [0, 1, 2, 3, 4, 5, 6, 7] },
							{ mode: "TC", stages: [0, 1, 2, 3, 4, 5, 6, 7] },
							{ mode: "RM", stages: [0, 1, 2, 3, 4, 5, 6, 7] },
							{ mode: "CB", stages: [0, 1, 2, 3, 4, 5, 6, 7] },
						],
					},
				},
			],
		});

		const result = await getDefaultMapWeights();

		const modes = new Set<string>();
		for (const key of result.keys()) {
			const mode = key.split("-")[0];
			modes.add(mode);
		}

		expect(modes.has("SZ")).toBe(true);
		expect(modes.has("TC")).toBe(true);
		expect(modes.has("RM")).toBe(true);
		expect(modes.has("CB")).toBe(true);
	});
});

// using db directly here instead of repositories as inserting skills would be too much of a hassle
async function insertUserMapModePreferencesForSeason({
	seasonNth,
	userPreferences,
}: {
	seasonNth: number;
	userPreferences: Array<{
		userId: number;
		mapModePreferences: UserMapModePreferences;
	}>;
}) {
	for (const { userId, mapModePreferences } of userPreferences) {
		await db
			.updateTable("User")
			.set({ mapModePreferences: JSON.stringify(mapModePreferences) })
			.where("id", "=", userId)
			.execute();

		await db
			.insertInto("Skill")
			.values({
				userId,
				season: seasonNth,
				mu: 25,
				sigma: 8.333,
				ordinal: 0,
				matchesCount: 10,
			})
			.execute();
	}
}
