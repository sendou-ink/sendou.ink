import { afterEach, beforeEach, describe, expect, test } from "vitest";
import * as UserFactory from "~/db/seed/factories/UserFactory";
import * as UserRepository from "~/features/user-page/UserRepository.server";
import { dbReset } from "~/utils/Test";
import * as AdminRepository from "./AdminRepository.server";

const users = UserFactory.pool();

// the ban log records who banned by their Discord id, so the tests give the users
// one they can name
const createUsers = (count: number) =>
	users.create(count, (index) => ({ discordId: String(index) }));

describe("findAllBannedUsers", () => {
	beforeEach(async () => {
		await createUsers(5);
	});

	afterEach(async () => {
		await dbReset();
	});

	test("returns empty Map when no users are banned", async () => {
		const result = await AdminRepository.findAllBannedUsers();

		expect(result.size).toBe(0);
	});

	test("returns Map with single banned user", async () => {
		await AdminRepository.banUser({
			userId: users.id(1),
			banned: 1,
			bannedReason: "Test ban",
			bannedByUserId: users.id(2),
		});

		const result = await AdminRepository.findAllBannedUsers();

		expect(result.size).toBe(1);
		expect(result.get(users.id(1))).toBeDefined();
		expect(result.get(users.id(1))?.userId).toBe(users.id(1));
		expect(result.get(users.id(1))?.banned).toBe(1);
		expect(result.get(users.id(1))?.bannedReason).toBe("Test ban");
	});

	test("returns Map with multiple banned users", async () => {
		await AdminRepository.banUser({
			userId: users.id(1),
			banned: 1,
			bannedReason: "Reason 1",
			bannedByUserId: users.id(3),
		});
		await AdminRepository.banUser({
			userId: users.id(2),
			banned: 1,
			bannedReason: "Reason 2",
			bannedByUserId: users.id(3),
		});

		const result = await AdminRepository.findAllBannedUsers();

		expect(result.size).toBe(2);
		expect(result.get(users.id(1))?.userId).toBe(users.id(1));
		expect(result.get(users.id(2))?.userId).toBe(users.id(2));
	});

	test("excludes non-banned users from results", async () => {
		await AdminRepository.banUser({
			userId: users.id(1),
			banned: 1,
			bannedReason: "Test ban",
			bannedByUserId: users.id(2),
		});

		const result = await AdminRepository.findAllBannedUsers();

		expect(result.size).toBe(1);
		expect(result.get(users.id(1))).toBeDefined();
		expect(result.get(users.id(2))).toBeUndefined();
		expect(result.get(users.id(3))).toBeUndefined();
	});

	test("includes both permanently and temporarily banned users", async () => {
		const futureDate = new Date(Date.now() + 1000 * 60 * 60 * 24 * 7);

		await AdminRepository.banUser({
			userId: users.id(1),
			banned: 1,
			bannedReason: "Permanent ban",
			bannedByUserId: users.id(3),
		});
		await AdminRepository.banUser({
			userId: users.id(2),
			banned: futureDate,
			bannedReason: "Temporary ban",
			bannedByUserId: users.id(3),
		});

		const result = await AdminRepository.findAllBannedUsers();

		expect(result.size).toBe(2);
		expect(result.get(users.id(1))?.banned).toBe(1);
		expect(result.get(users.id(2))?.banned).toBeGreaterThan(1);
	});
});

describe("banUser", () => {
	beforeEach(async () => {
		await createUsers(3);
	});

	afterEach(async () => {
		await dbReset();
	});

	test("permanently bans user (banned = 1)", async () => {
		await AdminRepository.banUser({
			userId: users.id(1),
			banned: 1,
			bannedReason: "Test permanent ban",
			bannedByUserId: users.id(2),
		});

		const result = await AdminRepository.findAllBannedUsers();

		expect(result.get(users.id(1))?.banned).toBe(1);
		expect(result.get(users.id(1))?.bannedReason).toBe("Test permanent ban");
	});

	test("temporarily bans user (banned = Date)", async () => {
		const futureDate = new Date(Date.now() + 1000 * 60 * 60 * 24 * 7);

		await AdminRepository.banUser({
			userId: users.id(1),
			banned: futureDate,
			bannedReason: "Test temporary ban",
			bannedByUserId: users.id(2),
		});

		const result = await AdminRepository.findAllBannedUsers();

		expect(result.get(users.id(1))?.banned).toBeGreaterThan(1);
		expect(result.get(users.id(1))?.bannedReason).toBe("Test temporary ban");
	});

	test("sets bannedReason correctly", async () => {
		const reason = "Violating terms of service";

		await AdminRepository.banUser({
			userId: users.id(1),
			banned: 1,
			bannedReason: reason,
			bannedByUserId: users.id(2),
		});

		const result = await AdminRepository.findAllBannedUsers();

		expect(result.get(users.id(1))?.bannedReason).toBe(reason);
	});

	test("creates BanLog entry when bannedByUserId is provided", async () => {
		await AdminRepository.banUser({
			userId: users.id(1),
			banned: 1,
			bannedReason: "Test ban",
			bannedByUserId: users.id(2),
		});

		const modInfo = await UserRepository.findModInfoById(users.id(1));

		expect(modInfo?.banLogs).toHaveLength(1);
		expect(modInfo?.banLogs[0].banned).toBe(1);
		expect(modInfo?.banLogs[0].bannedReason).toBe("Test ban");
		expect(modInfo?.banLogs[0].discordId).toBe("1");
	});

	test("does not create BanLog when bannedByUserId is null (automatic ban)", async () => {
		await AdminRepository.banUser({
			userId: users.id(1),
			banned: 1,
			bannedReason: "Automatic ban",
			bannedByUserId: null,
		});

		const modInfo = await UserRepository.findModInfoById(users.id(1));

		expect(modInfo?.banLogs).toHaveLength(0);
	});

	test("updates existing user correctly", async () => {
		const bannedUsers = await AdminRepository.findAllBannedUsers();
		expect(bannedUsers.size).toBe(0);

		await AdminRepository.banUser({
			userId: users.id(1),
			banned: 1,
			bannedReason: "First ban",
			bannedByUserId: users.id(2),
		});

		let result = await AdminRepository.findAllBannedUsers();
		expect(result.size).toBe(1);

		await AdminRepository.banUser({
			userId: users.id(1),
			banned: 1,
			bannedReason: "Updated ban reason",
			bannedByUserId: users.id(2),
		});

		result = await AdminRepository.findAllBannedUsers();
		expect(result.size).toBe(1);
		expect(result.get(users.id(1))?.bannedReason).toBe("Updated ban reason");

		const modInfo = await UserRepository.findModInfoById(users.id(1));
		expect(modInfo?.banLogs).toHaveLength(2);
		expect(modInfo?.banLogs[0].bannedReason).toBe("First ban");
		expect(modInfo?.banLogs[1].bannedReason).toBe("Updated ban reason");
	});
});

describe("unbanUser", () => {
	beforeEach(async () => {
		await createUsers(3);
	});

	afterEach(async () => {
		await dbReset();
	});

	test("unbans a previously banned user", async () => {
		await AdminRepository.banUser({
			userId: users.id(1),
			banned: 1,
			bannedReason: "Test ban",
			bannedByUserId: users.id(2),
		});

		let result = await AdminRepository.findAllBannedUsers();
		expect(result.size).toBe(1);

		await AdminRepository.unbanUser({
			userId: users.id(1),
			unbannedByUserId: users.id(2),
		});

		result = await AdminRepository.findAllBannedUsers();
		expect(result.size).toBe(0);
	});

	test("creates BanLog entry with correct unbannedByUserId", async () => {
		await AdminRepository.banUser({
			userId: users.id(1),
			banned: 1,
			bannedReason: "Test ban",
			bannedByUserId: users.id(2),
		});

		await AdminRepository.unbanUser({
			userId: users.id(1),
			unbannedByUserId: users.id(3),
		});

		const modInfo = await UserRepository.findModInfoById(users.id(1));

		expect(modInfo?.banLogs).toHaveLength(2);

		const unbanLog = modInfo?.banLogs.find((log) => log.banned === 0);
		expect(unbanLog).toBeDefined();
		expect(unbanLog?.bannedReason).toBeNull();
		expect(unbanLog?.discordId).toBe("2");
	});

	test("can unban permanently banned user", async () => {
		await AdminRepository.banUser({
			userId: users.id(1),
			banned: 1,
			bannedReason: "Permanent ban",
			bannedByUserId: users.id(2),
		});

		await AdminRepository.unbanUser({
			userId: users.id(1),
			unbannedByUserId: users.id(2),
		});

		const result = await AdminRepository.findAllBannedUsers();

		expect(result.size).toBe(0);
	});

	test("can unban temporarily banned user", async () => {
		const futureDate = new Date(Date.now() + 1000 * 60 * 60 * 24 * 7);

		await AdminRepository.banUser({
			userId: users.id(1),
			banned: futureDate,
			bannedReason: "Temporary ban",
			bannedByUserId: users.id(2),
		});

		await AdminRepository.unbanUser({
			userId: users.id(1),
			unbannedByUserId: users.id(2),
		});

		const result = await AdminRepository.findAllBannedUsers();

		expect(result.size).toBe(0);
	});
});
