import { beforeEach, describe, expect, test } from "vitest";
import * as UserFactory from "~/db/seed/factories/UserFactory";
import * as VodFactory from "~/db/seed/factories/VodFactory";
import * as VodRepository from "./VodRepository.server";

const users = UserFactory.pool();

describe("findByUserId", () => {
	beforeEach(async () => {
		await users.create(5);
	});

	test("returns vods for a specific user", async () => {
		await VodFactory.create({
			submitterUserId: users.id(1),
			pov: { type: "USER", userId: users.id(1) },
		});
		await VodFactory.create({
			submitterUserId: users.id(1),
			pov: { type: "USER", userId: users.id(2) },
		});
		await VodFactory.create({
			submitterUserId: users.id(1),
			pov: { type: "USER", userId: users.id(3) },
		});

		const result = await VodRepository.findByUserId(users.id(2));

		expect(result).toHaveLength(1);
	});

	test("returns empty array when user has no vods", async () => {
		await VodFactory.create({
			submitterUserId: users.id(1),
			pov: { type: "USER", userId: users.id(1) },
		});

		const result = await VodRepository.findByUserId(users.id(2));

		expect(result).toHaveLength(0);
	});

	test("respects the limit parameter", async () => {
		await VodFactory.createMany(3, {
			submitterUserId: users.id(1),
			pov: { type: "USER", userId: users.id(1) },
		});

		const result = await VodRepository.findByUserId(users.id(1), 2);

		expect(result).toHaveLength(2);
	});
});

describe("findVods", () => {
	beforeEach(async () => {
		await users.create(5);
	});

	test("filters by weapon", async () => {
		const vod = await VodFactory.create({
			submitterUserId: users.id(1),
			matches: [{ mode: "TW", stageId: 0, startsAt: "0:00", weapons: [1000] }],
		});
		await VodFactory.create({
			submitterUserId: users.id(1),
			matches: [{ mode: "TW", stageId: 0, startsAt: "0:00", weapons: [2000] }],
		});

		const result = await VodRepository.findVods({ weapon: 1000 });

		expect(result.length).toBeGreaterThan(0);
		expect(result.some((otherVod) => otherVod.id === vod.id)).toBe(true);
	});

	test("filters by mode", async () => {
		for (const mode of ["TW", "SZ", "TC"] as const) {
			await VodFactory.create({
				submitterUserId: users.id(1),
				matches: [{ mode, stageId: 0, startsAt: "0:00", weapons: [0] }],
			});
		}

		const result = await VodRepository.findVods({ mode: "SZ" });

		expect(result).toHaveLength(1);
	});

	test("filters by stageId", async () => {
		for (const stageId of [0, 1, 2] as const) {
			await VodFactory.create({
				submitterUserId: users.id(1),
				matches: [{ mode: "TW", stageId, startsAt: "0:00", weapons: [0] }],
			});
		}

		const result = await VodRepository.findVods({ stageId: 1 });

		expect(result).toHaveLength(1);
	});

	test("filters by type", async () => {
		for (const type of ["TOURNAMENT", "CAST", "SCRIM"] as const) {
			await VodFactory.create({ submitterUserId: users.id(1), type });
		}

		const result = await VodRepository.findVods({ type: "CAST" });

		expect(result).toHaveLength(1);
	});

	test("returns all vods when no filters provided", async () => {
		await VodFactory.createMany(3, { submitterUserId: users.id(1) });

		const result = await VodRepository.findVods({});

		expect(result).toHaveLength(3);
	});

	test("respects limit parameter", async () => {
		await VodFactory.createMany(3, { submitterUserId: users.id(1) });

		const result = await VodRepository.findVods({ limit: 2 });

		expect(result).toHaveLength(2);
	});
});

describe("findVodById", () => {
	beforeEach(async () => {
		await users.create(5);
	});

	test("returns null when vod doesn't exist", async () => {
		const result = await VodRepository.findVodById(999);

		expect(result).toBeNull();
	});

	test("correctly resolves pov from user", async () => {
		const vod = await VodFactory.create({
			submitterUserId: users.id(1),
			pov: { type: "USER", userId: users.id(1) },
		});

		const result = await VodRepository.findVodById(vod.id);

		expect(result).not.toBeNull();
		expect(result?.pov).toBeDefined();
		expect(typeof result?.pov).not.toBe("string");
	});

	test("correctly resolves pov from player name", async () => {
		const vod = await VodFactory.create({
			submitterUserId: users.id(1),
			pov: { type: "NAME", name: "PlayerName" },
		});

		const result = await VodRepository.findVodById(vod.id);

		expect(result).not.toBeNull();
		expect(result?.pov).toBe("PlayerName");
	});
});

describe("insert", () => {
	beforeEach(async () => {
		await users.create(5);
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
					stageId: 0,
					startsAt: "0:00",
					weapons: [0, 10, 20],
				},
			],
			type: "TOURNAMENT",
			pov: { type: "USER", userId: users.id(1) },
			submitterUserId: users.id(1),
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
		const { id } = await VodRepository.insert({
			title: "Test VOD",
			youtubeUrl: "https://www.youtube.com/watch?v=test1",
			date: {
				day: 1,
				month: 0,
				year: 2024,
			},
			matches: [],
			type: "TOURNAMENT",
			submitterUserId: users.id(1),
			isValidated: true,
		});

		const result = await VodRepository.findVodById(id);

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
					stageId: 0,
					startsAt: "0:00",
					weapons: [0],
				},
			],
			type: "TOURNAMENT",
			pov: { type: "NAME", name: "TestPlayer" },
			submitterUserId: users.id(1),
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
					stageId: 0,
					startsAt: "0:00",
					weapons: [0],
				},
			],
			type: "TOURNAMENT",
			pov: { type: "USER", userId: users.id(1) },
			submitterUserId: users.id(1),
			isValidated: true,
		});

		const vod = await VodRepository.findVodById(result.id);

		expect(vod?.pov).toBeDefined();
		expect(typeof vod?.pov).not.toBe("string");
	});
});

describe("update", () => {
	beforeEach(async () => {
		await users.create(5);
	});

	test("updates vod metadata", async () => {
		const vod = await VodFactory.create({
			submitterUserId: users.id(1),
			pov: { type: "USER", userId: users.id(1) },
		});

		await VodRepository.update({
			id: vod.id,
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
					stageId: 5,
					startsAt: "0:00",
					weapons: [50],
				},
			],
			type: "CAST",
			pov: { type: "USER", userId: users.id(2) },
			submitterUserId: users.id(1),
			isValidated: true,
		});

		const result = await VodRepository.findVodById(vod.id);

		expect(result?.title).toBe("Updated Title");
		expect(result?.youtubeId).toBe("updated123");
		expect(result?.type).toBe("CAST");
	});

	test("deletes and recreates matches", async () => {
		const vod = await VodFactory.create({
			submitterUserId: users.id(1),
			matches: [
				{ mode: "TW", stageId: 0, startsAt: "0:00", weapons: [0] },
				{ mode: "SZ", stageId: 1, startsAt: "5:00", weapons: [10] },
			],
		});

		await VodRepository.update({
			id: vod.id,
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
					stageId: 2,
					startsAt: "0:00",
					weapons: [20],
				},
			],
			type: "TOURNAMENT",
			pov: { type: "USER", userId: users.id(1) },
			submitterUserId: users.id(1),
			isValidated: true,
		});

		const result = await VodRepository.findVodById(vod.id);

		expect(result?.matches).toHaveLength(1);
		expect(result?.matches[0].mode).toBe("TC");
	});
});

describe("deleteById", () => {
	beforeEach(async () => {
		await users.create(5);
	});

	test("deletes vod by id", async () => {
		const vod = await VodFactory.create({ submitterUserId: users.id(1) });

		await VodRepository.deleteById(vod.id);

		const result = await VodRepository.findVodById(vod.id);
		expect(result).toBeNull();
	});

	test("only deletes the specified vod", async () => {
		const [firstVod, secondVod] = await VodFactory.createMany(2, {
			submitterUserId: users.id(1),
		});

		await VodRepository.deleteById(firstVod.id);

		const firstResult = await VodRepository.findVodById(firstVod.id);
		const secondResult = await VodRepository.findVodById(secondVod.id);

		expect(firstResult).toBeNull();
		expect(secondResult).not.toBeNull();
	});
});
