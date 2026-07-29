import { beforeEach, describe, expect, test } from "vitest";
import * as UserFactory from "~/db/seed/factories/UserFactory";
import * as UserRepository from "~/features/user-page/UserRepository.server";
import * as AdminRepository from "./AdminRepository.server";

const users = UserFactory.pool();

// the ban log records who banned by their Discord id, so the tests give the users
// one they can name
const createUsers = (count: number) =>
	users.create(count, (index) => ({ discordId: String(index) }));

describe("findAllBannedUsers", () => {
	let admin: { id: number };

	const createBannedUser = (bannedReason: string, banned: 1 | Date = 1) =>
		UserFactory.create(null, {
			ban: { banned, bannedReason, bannedByUserId: admin.id },
		});

	beforeEach(async () => {
		admin = await UserFactory.create();
	});

	test("returns empty Map when no users are banned", async () => {
		await UserFactory.create();

		const result = await AdminRepository.findAllBannedUsers();

		expect(result.size).toBe(0);
	});

	test("returns Map with single banned user", async () => {
		const banned = await createBannedUser("Test ban");

		const result = await AdminRepository.findAllBannedUsers();

		expect(result.size).toBe(1);
		expect(result.get(banned.id)).toBeDefined();
		expect(result.get(banned.id)?.userId).toBe(banned.id);
		expect(result.get(banned.id)?.banned).toBe(1);
		expect(result.get(banned.id)?.bannedReason).toBe("Test ban");
	});

	test("returns Map with multiple banned users", async () => {
		const first = await createBannedUser("Reason 1");
		const second = await createBannedUser("Reason 2");

		const result = await AdminRepository.findAllBannedUsers();

		expect(result.size).toBe(2);
		expect(result.get(first.id)?.userId).toBe(first.id);
		expect(result.get(second.id)?.userId).toBe(second.id);
	});

	test("excludes non-banned users from results", async () => {
		const banned = await createBannedUser("Test ban");
		const [other, another] = await UserFactory.createMany(2);

		const result = await AdminRepository.findAllBannedUsers();

		expect(result.size).toBe(1);
		expect(result.get(banned.id)).toBeDefined();
		expect(result.get(other.id)).toBeUndefined();
		expect(result.get(another.id)).toBeUndefined();
	});

	test("includes both permanently and temporarily banned users", async () => {
		const futureDate = new Date(Date.now() + 1000 * 60 * 60 * 24 * 7);

		const permanent = await createBannedUser("Permanent ban");
		const temporary = await createBannedUser("Temporary ban", futureDate);

		const result = await AdminRepository.findAllBannedUsers();

		expect(result.size).toBe(2);
		expect(result.get(permanent.id)?.banned).toBe(1);
		expect(result.get(temporary.id)?.banned).toBeGreaterThan(1);
	});
});

describe("banUser", () => {
	beforeEach(async () => {
		await createUsers(3);
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
		expect(modInfo?.banLogs[0].id).toBe(users.id(2));
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
	let banner: { id: number };
	let unbanner: { id: number };

	const createBannedUser = (bannedReason: string, banned: 1 | Date = 1) =>
		UserFactory.create(null, {
			ban: { banned, bannedReason, bannedByUserId: banner.id },
		});

	beforeEach(async () => {
		// the unban log records who unbanned by their Discord id
		banner = await UserFactory.create({ discordId: "1" });
		unbanner = await UserFactory.create({ discordId: "2" });
	});

	test("unbans a previously banned user", async () => {
		const banned = await createBannedUser("Test ban");

		let result = await AdminRepository.findAllBannedUsers();
		expect(result.size).toBe(1);

		await AdminRepository.unbanUser({
			userId: banned.id,
			unbannedByUserId: unbanner.id,
		});

		result = await AdminRepository.findAllBannedUsers();
		expect(result.size).toBe(0);
	});

	test("creates BanLog entry with correct unbannedByUserId", async () => {
		const banned = await createBannedUser("Test ban");

		await AdminRepository.unbanUser({
			userId: banned.id,
			unbannedByUserId: unbanner.id,
		});

		const modInfo = await UserRepository.findModInfoById(banned.id);

		expect(modInfo?.banLogs).toHaveLength(2);

		const unbanLog = modInfo?.banLogs.find((log) => log.banned === 0);
		expect(unbanLog).toBeDefined();
		expect(unbanLog?.bannedReason).toBeNull();
		expect(unbanLog?.id).toBe(unbanner.id);
	});

	test("can unban permanently banned user", async () => {
		const banned = await createBannedUser("Permanent ban");

		await AdminRepository.unbanUser({
			userId: banned.id,
			unbannedByUserId: unbanner.id,
		});

		const result = await AdminRepository.findAllBannedUsers();

		expect(result.size).toBe(0);
	});

	test("can unban temporarily banned user", async () => {
		const futureDate = new Date(Date.now() + 1000 * 60 * 60 * 24 * 7);

		const banned = await createBannedUser("Temporary ban", futureDate);

		await AdminRepository.unbanUser({
			userId: banned.id,
			unbannedByUserId: unbanner.id,
		});

		const result = await AdminRepository.findAllBannedUsers();

		expect(result.size).toBe(0);
	});
});
