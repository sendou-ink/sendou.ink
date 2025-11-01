import { afterEach, beforeEach, describe, expect, test } from "vitest";
import type { MainWeaponId, StageId } from "~/modules/in-game-lists/types";
import { dbInsertUsers, dbReset } from "~/utils/Test";
import * as VodRepository from "./VodRepository.server";

let vodCounter = 0;

const createVod = async ({
	submitterUserId,
	type = "TOURNAMENT",
	povUserId,
	povName,
	weaponSplIds = [0, 10],
	mode = "TW",
	stageId = 0,
	isValidated = true,
}: {
	submitterUserId: number;
	type?: "TOURNAMENT" | "CAST" | "SCRIM";
	povUserId?: number;
	povName?: string;
	weaponSplIds?: MainWeaponId[];
	mode?: "TW" | "SZ" | "TC" | "RM" | "CB";
	stageId?: StageId;
	isValidated?: boolean;
}) => {
	vodCounter++;

	const result = await VodRepository.insert({
		title: `Test VOD ${vodCounter}`,
		youtubeUrl: `https://www.youtube.com/watch?v=test${vodCounter}`,
		date: {
			day: 1,
			month: 0,
			year: 2024,
		},
		matches: [
			{
				mode,
				stageId: stageId,
				startsAt: "0:00",
				weapons: weaponSplIds,
			},
		],
		type,
		pov: povUserId
			? { type: "USER", userId: povUserId }
			: povName
				? { type: "NAME", name: povName }
				: undefined,
		submitterUserId,
		isValidated,
	});

	return result.id;
};

describe("findByUserId", () => {
	beforeEach(async () => {
		vodCounter = 0;
		await dbInsertUsers(5);
	});

	afterEach(() => {
		dbReset();
	});

	test("returns vods for a specific user", async () => {
		await createVod({ submitterUserId: 1, povUserId: 1 });
		await createVod({ submitterUserId: 1, povUserId: 2 });
		await createVod({ submitterUserId: 1, povUserId: 3 });

		const result = await VodRepository.findByUserId(2);

		expect(result).toHaveLength(1);
	});

	test("returns empty array when user has no vods", async () => {
		await createVod({ submitterUserId: 1, povUserId: 1 });

		const result = await VodRepository.findByUserId(2);

		expect(result).toHaveLength(0);
	});

	test("respects the limit parameter", async () => {
		await createVod({ submitterUserId: 1, povUserId: 1 });
		await createVod({ submitterUserId: 1, povUserId: 1 });
		await createVod({ submitterUserId: 1, povUserId: 1 });

		const result = await VodRepository.findByUserId(1, 2);

		expect(result).toHaveLength(2);
	});
});

describe("findVods", () => {
	beforeEach(async () => {
		vodCounter = 0;
		await dbInsertUsers(5);
	});

	afterEach(() => {
		dbReset();
	});

	test("filters by weapon", async () => {
		const vodId = await createVod({
			submitterUserId: 1,
			povUserId: 1,
			weaponSplIds: [1000],
		});
		await createVod({
			submitterUserId: 1,
			povUserId: 1,
			weaponSplIds: [2000],
		});

		const result = await VodRepository.findVods({ weapon: 1000 });

		expect(result.length).toBeGreaterThan(0);
		expect(result.some((vod) => vod.id === vodId)).toBe(true);
	});

	test("filters by mode", async () => {
		await createVod({ submitterUserId: 1, povUserId: 1, mode: "TW" });
		await createVod({ submitterUserId: 1, povUserId: 1, mode: "SZ" });
		await createVod({ submitterUserId: 1, povUserId: 1, mode: "TC" });

		const result = await VodRepository.findVods({ mode: "SZ" });

		expect(result).toHaveLength(1);
	});

	test("filters by stageId", async () => {
		await createVod({ submitterUserId: 1, povUserId: 1, stageId: 0 });
		await createVod({ submitterUserId: 1, povUserId: 1, stageId: 1 });
		await createVod({ submitterUserId: 1, povUserId: 1, stageId: 2 });

		const result = await VodRepository.findVods({ stageId: 1 });

		expect(result).toHaveLength(1);
	});

	test("filters by type", async () => {
		await createVod({ submitterUserId: 1, povUserId: 1, type: "TOURNAMENT" });
		await createVod({ submitterUserId: 1, povUserId: 1, type: "CAST" });
		await createVod({ submitterUserId: 1, povUserId: 1, type: "SCRIM" });

		const result = await VodRepository.findVods({ type: "CAST" });

		expect(result).toHaveLength(1);
	});

	test("returns all vods when no filters provided", async () => {
		await createVod({ submitterUserId: 1, povUserId: 1 });
		await createVod({ submitterUserId: 1, povUserId: 2 });
		await createVod({ submitterUserId: 1, povUserId: 3 });

		const result = await VodRepository.findVods({});

		expect(result).toHaveLength(3);
	});

	test("respects limit parameter", async () => {
		await createVod({ submitterUserId: 1, povUserId: 1 });
		await createVod({ submitterUserId: 1, povUserId: 1 });
		await createVod({ submitterUserId: 1, povUserId: 1 });

		const result = await VodRepository.findVods({ limit: 2 });

		expect(result).toHaveLength(2);
	});
});

describe("findVodById", () => {
	beforeEach(async () => {
		vodCounter = 0;
		await dbInsertUsers(5);
	});

	afterEach(() => {
		dbReset();
	});

	test("returns null when vod doesn't exist", async () => {
		const result = await VodRepository.findVodById(999);

		expect(result).toBeNull();
	});

	test("correctly resolves pov from user", async () => {
		const vodId = await createVod({ submitterUserId: 1, povUserId: 1 });

		const result = await VodRepository.findVodById(vodId);

		expect(result).not.toBeNull();
		expect(result?.pov).toBeDefined();
		expect(typeof result?.pov).not.toBe("string");
	});

	test("correctly resolves pov from player name", async () => {
		const vodId = await createVod({
			submitterUserId: 1,
			povName: "PlayerName",
		});

		const result = await VodRepository.findVodById(vodId);

		expect(result).not.toBeNull();
		expect(result?.pov).toBe("PlayerName");
	});
});

describe("insert", () => {
	beforeEach(async () => {
		vodCounter = 0;
		await dbInsertUsers(5);
	});

	afterEach(() => {
		dbReset();
	});

	test("inserts vod with all metadata", async () => {
		const result = await VodRepository.insert({
			title: "Complete VOD",
			youtubeUrl: "https://www.youtube.com/watch?v=abc123",
			date: {
				day: 15,
				month: 5,
				year: 2024,
			},
			matches: [
				{
					mode: "TW",
					stageId: 0 as any,
					startsAt: "0:00",
					weapons: [0, 10, 20] as any,
				},
			],
			type: "TOURNAMENT",
			pov: { type: "USER", userId: 1 },
			submitterUserId: 1,
			isValidated: true,
		});

		const vod = await VodRepository.findVodById(result.id);

		expect(vod).not.toBeNull();
		expect(vod?.title).toBe("Complete VOD");
		expect(vod?.youtubeId).toBe("abc123");
		expect(vod?.type).toBe("TOURNAMENT");
		expect(vod?.matches).toHaveLength(1);
		expect(vod?.matches[0].weapons).toHaveLength(3);
	});

	test("extracts YouTube ID from URL correctly", async () => {
		const vodId = await createVod({
			submitterUserId: 1,
			povUserId: 1,
		});

		const result = await VodRepository.findVodById(vodId);

		expect(result?.youtubeId).toBe("test1");
	});

	test("handles NAME type pov", async () => {
		const result = await VodRepository.insert({
			title: "Test VOD",
			youtubeUrl: "https://www.youtube.com/watch?v=test123",
			date: {
				day: 1,
				month: 0,
				year: 2024,
			},
			matches: [
				{
					mode: "TW",
					stageId: 0 as any,
					startsAt: "0:00",
					weapons: [0] as any,
				},
			],
			type: "TOURNAMENT",
			pov: { type: "NAME", name: "TestPlayer" },
			submitterUserId: 1,
			isValidated: true,
		});

		const vod = await VodRepository.findVodById(result.id);

		expect(vod?.pov).toBe("TestPlayer");
	});

	test("handles USER type pov", async () => {
		const result = await VodRepository.insert({
			title: "Test VOD",
			youtubeUrl: "https://www.youtube.com/watch?v=test123",
			date: {
				day: 1,
				month: 0,
				year: 2024,
			},
			matches: [
				{
					mode: "TW",
					stageId: 0 as any,
					startsAt: "0:00",
					weapons: [0] as any,
				},
			],
			type: "TOURNAMENT",
			pov: { type: "USER", userId: 1 },
			submitterUserId: 1,
			isValidated: true,
		});

		const vod = await VodRepository.findVodById(result.id);

		expect(vod?.pov).toBeDefined();
		expect(typeof vod?.pov).not.toBe("string");
	});
});

describe("update", () => {
	beforeEach(async () => {
		vodCounter = 0;
		await dbInsertUsers(5);
	});

	afterEach(() => {
		dbReset();
	});

	test("updates vod metadata", async () => {
		const vodId = await createVod({ submitterUserId: 1, povUserId: 1 });

		await VodRepository.update({
			id: vodId,
			title: "Updated Title",
			youtubeUrl: "https://www.youtube.com/watch?v=updated123",
			date: {
				day: 1,
				month: 0,
				year: 2024,
			},
			matches: [
				{
					mode: "SZ",
					stageId: 5 as any,
					startsAt: "0:00",
					weapons: [50] as any,
				},
			],
			type: "CAST",
			pov: { type: "USER", userId: 2 },
			submitterUserId: 1,
			isValidated: true,
		});

		const result = await VodRepository.findVodById(vodId);

		expect(result?.title).toBe("Updated Title");
		expect(result?.youtubeId).toBe("updated123");
		expect(result?.type).toBe("CAST");
	});

	test("deletes and recreates matches", async () => {
		const result = await VodRepository.insert({
			title: "Test VOD",
			youtubeUrl: "https://www.youtube.com/watch?v=test123",
			date: {
				day: 1,
				month: 0,
				year: 2024,
			},
			matches: [
				{
					mode: "TW",
					stageId: 0 as any,
					startsAt: "0:00",
					weapons: [0] as any,
				},
				{
					mode: "SZ",
					stageId: 1 as any,
					startsAt: "5:00",
					weapons: [10] as any,
				},
			],
			type: "TOURNAMENT",
			pov: { type: "USER", userId: 1 },
			submitterUserId: 1,
			isValidated: true,
		});

		await VodRepository.update({
			id: result.id,
			title: "Test VOD",
			youtubeUrl: "https://www.youtube.com/watch?v=test123",
			date: {
				day: 1,
				month: 0,
				year: 2024,
			},
			matches: [
				{
					mode: "TC",
					stageId: 2 as any,
					startsAt: "0:00",
					weapons: [20] as any,
				},
			],
			type: "TOURNAMENT",
			pov: { type: "USER", userId: 1 },
			submitterUserId: 1,
			isValidated: true,
		});

		const vod = await VodRepository.findVodById(result.id);

		expect(vod?.matches).toHaveLength(1);
		expect(vod?.matches[0].mode).toBe("TC");
	});
});

describe("deleteById", () => {
	beforeEach(async () => {
		vodCounter = 0;
		await dbInsertUsers(5);
	});

	afterEach(() => {
		dbReset();
	});

	test("deletes vod by id", async () => {
		const vodId = await createVod({ submitterUserId: 1, povUserId: 1 });

		await VodRepository.deleteById(vodId);

		const result = await VodRepository.findVodById(vodId);
		expect(result).toBeNull();
	});

	test("only deletes the specified vod", async () => {
		const firstVodId = await createVod({ submitterUserId: 1, povUserId: 1 });
		const secondVodId = await createVod({ submitterUserId: 1, povUserId: 1 });

		await VodRepository.deleteById(firstVodId);

		const firstResult = await VodRepository.findVodById(firstVodId);
		const secondResult = await VodRepository.findVodById(secondVodId);

		expect(firstResult).toBeNull();
		expect(secondResult).not.toBeNull();
	});
});
