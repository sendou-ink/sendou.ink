import { afterEach, beforeEach, describe, expect, test } from "vitest";
import * as UserRepository from "~/features/user-page/UserRepository.server";
import { dbInsertUsers, dbReset } from "~/utils/Test";
import * as AdminRepository from "./AdminRepository.server";

describe("allBannedUsers", () => {
	beforeEach(async () => {
		await dbInsertUsers(5);
	});

	afterEach(() => {
		dbReset();
	});

	test("returns empty Map when no users are banned", async () => {
		const result = await AdminRepository.allBannedUsers();

		expect(result.size).toBe(0);
	});

	test("returns Map with single banned user", async () => {
		await AdminRepository.banUser({
			userId: 1,
			banned: 1,
			bannedReason: "Test ban",
			bannedByUserId: 2,
		});

		const result = await AdminRepository.allBannedUsers();

		expect(result.size).toBe(1);
		expect(result.get(1)).toBeDefined();
		expect(result.get(1)?.userId).toBe(1);
		expect(result.get(1)?.banned).toBe(1);
		expect(result.get(1)?.bannedReason).toBe("Test ban");
	});

	test("returns Map with multiple banned users", async () => {
		await AdminRepository.banUser({
			userId: 1,
			banned: 1,
			bannedReason: "Reason 1",
			bannedByUserId: 3,
		});
		await AdminRepository.banUser({
			userId: 2,
			banned: 1,
			bannedReason: "Reason 2",
			bannedByUserId: 3,
		});

		const result = await AdminRepository.allBannedUsers();

		expect(result.size).toBe(2);
		expect(result.get(1)?.userId).toBe(1);
		expect(result.get(2)?.userId).toBe(2);
	});

	test("excludes non-banned users from results", async () => {
		await AdminRepository.banUser({
			userId: 1,
			banned: 1,
			bannedReason: "Test ban",
			bannedByUserId: 2,
		});

		const result = await AdminRepository.allBannedUsers();

		expect(result.size).toBe(1);
		expect(result.get(1)).toBeDefined();
		expect(result.get(2)).toBeUndefined();
		expect(result.get(3)).toBeUndefined();
	});

	test("includes both permanently and temporarily banned users", async () => {
		const futureDate = new Date(Date.now() + 1000 * 60 * 60 * 24 * 7);

		await AdminRepository.banUser({
			userId: 1,
			banned: 1,
			bannedReason: "Permanent ban",
			bannedByUserId: 3,
		});
		await AdminRepository.banUser({
			userId: 2,
			banned: futureDate,
			bannedReason: "Temporary ban",
			bannedByUserId: 3,
		});

		const result = await AdminRepository.allBannedUsers();

		expect(result.size).toBe(2);
		expect(result.get(1)?.banned).toBe(1);
		expect(result.get(2)?.banned).toBeGreaterThan(1);
	});
});

describe("banUser", () => {
	beforeEach(async () => {
		await dbInsertUsers(3);
	});

	afterEach(() => {
		dbReset();
	});

	test("permanently bans user (banned = 1)", async () => {
		await AdminRepository.banUser({
			userId: 1,
			banned: 1,
			bannedReason: "Test permanent ban",
			bannedByUserId: 2,
		});

		const result = await AdminRepository.allBannedUsers();

		expect(result.get(1)?.banned).toBe(1);
		expect(result.get(1)?.bannedReason).toBe("Test permanent ban");
	});

	test("temporarily bans user (banned = Date)", async () => {
		const futureDate = new Date(Date.now() + 1000 * 60 * 60 * 24 * 7);

		await AdminRepository.banUser({
			userId: 1,
			banned: futureDate,
			bannedReason: "Test temporary ban",
			bannedByUserId: 2,
		});

		const result = await AdminRepository.allBannedUsers();

		expect(result.get(1)?.banned).toBeGreaterThan(1);
		expect(result.get(1)?.bannedReason).toBe("Test temporary ban");
	});

	test("sets bannedReason correctly", async () => {
		const reason = "Violating terms of service";

		await AdminRepository.banUser({
			userId: 1,
			banned: 1,
			bannedReason: reason,
			bannedByUserId: 2,
		});

		const result = await AdminRepository.allBannedUsers();

		expect(result.get(1)?.bannedReason).toBe(reason);
	});

	test("creates BanLog entry when bannedByUserId is provided", async () => {
		await AdminRepository.banUser({
			userId: 1,
			banned: 1,
			bannedReason: "Test ban",
			bannedByUserId: 2,
		});

		const modInfo = await UserRepository.findModInfoById(1);

		expect(modInfo?.banLogs).toHaveLength(1);
		expect(modInfo?.banLogs[0].banned).toBe(1);
		expect(modInfo?.banLogs[0].bannedReason).toBe("Test ban");
		expect(modInfo?.banLogs[0].discordId).toBe("1");
	});

	test("does not create BanLog when bannedByUserId is null (automatic ban)", async () => {
		await AdminRepository.banUser({
			userId: 1,
			banned: 1,
			bannedReason: "Automatic ban",
			bannedByUserId: null,
		});

		const modInfo = await UserRepository.findModInfoById(1);

		expect(modInfo?.banLogs).toHaveLength(0);
	});

	test("updates existing user correctly", async () => {
		const bannedUsers = await AdminRepository.allBannedUsers();
		expect(bannedUsers.size).toBe(0);

		await AdminRepository.banUser({
			userId: 1,
			banned: 1,
			bannedReason: "First ban",
			bannedByUserId: 2,
		});

		let result = await AdminRepository.allBannedUsers();
		expect(result.size).toBe(1);

		await AdminRepository.banUser({
			userId: 1,
			banned: 1,
			bannedReason: "Updated ban reason",
			bannedByUserId: 2,
		});

		result = await AdminRepository.allBannedUsers();
		expect(result.size).toBe(1);
		expect(result.get(1)?.bannedReason).toBe("Updated ban reason");

		const modInfo = await UserRepository.findModInfoById(1);
		expect(modInfo?.banLogs).toHaveLength(2);
		expect(modInfo?.banLogs[0].bannedReason).toBe("First ban");
		expect(modInfo?.banLogs[1].bannedReason).toBe("Updated ban reason");
	});
});

describe("unbanUser", () => {
	beforeEach(async () => {
		await dbInsertUsers(3);
	});

	afterEach(() => {
		dbReset();
	});

	test("unbans a previously banned user", async () => {
		await AdminRepository.banUser({
			userId: 1,
			banned: 1,
			bannedReason: "Test ban",
			bannedByUserId: 2,
		});

		let result = await AdminRepository.allBannedUsers();
		expect(result.size).toBe(1);

		await AdminRepository.unbanUser({
			userId: 1,
			unbannedByUserId: 2,
		});

		result = await AdminRepository.allBannedUsers();
		expect(result.size).toBe(0);
	});

	test("creates BanLog entry with correct unbannedByUserId", async () => {
		await AdminRepository.banUser({
			userId: 1,
			banned: 1,
			bannedReason: "Test ban",
			bannedByUserId: 2,
		});

		await AdminRepository.unbanUser({
			userId: 1,
			unbannedByUserId: 3,
		});

		const modInfo = await UserRepository.findModInfoById(1);

		expect(modInfo?.banLogs).toHaveLength(2);

		const unbanLog = modInfo?.banLogs.find((log) => log.banned === 0);
		expect(unbanLog).toBeDefined();
		expect(unbanLog?.bannedReason).toBeNull();
		expect(unbanLog?.discordId).toBe("2");
	});

	test("can unban permanently banned user", async () => {
		await AdminRepository.banUser({
			userId: 1,
			banned: 1,
			bannedReason: "Permanent ban",
			bannedByUserId: 2,
		});

		await AdminRepository.unbanUser({
			userId: 1,
			unbannedByUserId: 2,
		});

		const result = await AdminRepository.allBannedUsers();

		expect(result.size).toBe(0);
	});

	test("can unban temporarily banned user", async () => {
		const futureDate = new Date(Date.now() + 1000 * 60 * 60 * 24 * 7);

		await AdminRepository.banUser({
			userId: 1,
			banned: futureDate,
			bannedReason: "Temporary ban",
			bannedByUserId: 2,
		});

		await AdminRepository.unbanUser({
			userId: 1,
			unbannedByUserId: 2,
		});

		const result = await AdminRepository.allBannedUsers();

		expect(result.size).toBe(0);
	});
});
