import { describe, expect, test } from "vitest";
import * as UserFactory from "~/db/seed/factories/UserFactory";
import * as UserRepository from "./UserRepository.server";

describe("UserRepository", () => {
	test("created user has createdAt field", async () => {
		await UserRepository.upsert({
			discordId: "1",
			discordName: "TestUser",
			discordAvatar: null,
		});

		const user = await UserRepository.findModInfoById(1);

		expect(user).toBeDefined();
		expect(user?.createdAt).toBeDefined();
	});

	test("updates user name when upserting", async () => {
		await UserRepository.upsert({
			discordId: "1",
			discordName: "TestUser",
			discordAvatar: null,
		});

		const user = await UserRepository.findLayoutDataByIdentifier("1");

		expect(user?.username).toBe("TestUser");

		await UserRepository.upsert({
			discordId: "1",
			discordName: "UpdatedUser",
			discordAvatar: null,
		});

		const updatedUser = await UserRepository.findLayoutDataByIdentifier("1");
		expect(updatedUser?.username).toBe("UpdatedUser");
	});

	test("updating a user doesn't change the createdAt field", async () => {
		await UserRepository.upsert({
			discordId: "1",
			discordName: "TestUser",
			discordAvatar: null,
		});

		const user = await UserRepository.findModInfoById(1);
		const createdAt = user?.createdAt;

		await UserRepository.upsert({
			discordId: "1",
			discordName: "UpdatedUser",
			discordAvatar: null,
		});

		const updatedUser = await UserRepository.findModInfoById(1);
		expect(updatedUser?.createdAt).toEqual(createdAt);
	});

	test("new user gets joinOrder of 1", async () => {
		const { id } = await UserRepository.upsert({
			discordId: "1",
			discordName: "TestUser",
			discordAvatar: null,
		});

		const result = await UserRepository.findJoinOrderByUserId(id);

		expect(result?.joinOrder).toBe(1);
	});

	test("joinOrder increments for each new user and does not change on update", async () => {
		const { id: firstId } = await UserRepository.upsert({
			discordId: "1",
			discordName: "FirstUser",
			discordAvatar: null,
		});

		const { id: secondId } = await UserRepository.upsert({
			discordId: "2",
			discordName: "SecondUser",
			discordAvatar: null,
		});

		expect(
			(await UserRepository.findJoinOrderByUserId(firstId))?.joinOrder,
		).toBe(1);
		expect(
			(await UserRepository.findJoinOrderByUserId(secondId))?.joinOrder,
		).toBe(2);

		await UserRepository.upsert({
			discordId: "1",
			discordName: "UpdatedFirstUser",
			discordAvatar: null,
		});

		expect(
			(await UserRepository.findJoinOrderByUserId(firstId))?.joinOrder,
		).toBe(1);
	});

	describe("userRoles", () => {
		test("returns empty array for basic user", async () => {
			await UserFactory.createAdmin();

			const recentDiscordId = String(
				(BigInt(Date.now() - 1420070400000) << 22n) + 1n,
			);
			const { id } = await UserFactory.create({
				discordId: recentDiscordId,
			});

			const user = await UserRepository.findLeanById(id);

			expect(user?.roles).toEqual([]);
		});

		test("returns ADMIN and STAFF roles for admin user", async () => {
			const { id } = await UserFactory.createAdmin();

			const user = await UserRepository.findLeanById(id);

			expect(user?.roles).toContain("ADMIN");
			expect(user?.roles).toContain("STAFF");
		});

		test("returns MINOR_SUPPORT role for patron tier 1", async () => {
			const { id } = await UserFactory.create(null, { patronTier: 1 });

			const user = await UserRepository.findLeanById(id);

			expect(user?.roles).toContain("MINOR_SUPPORT");
			expect(user?.roles).not.toContain("SUPPORTER");
		});

		test("returns SUPPORTER, MINOR_SUPPORT, TOURNAMENT_ADDER, CALENDAR_EVENT_ADDER, and API_ACCESSER roles for patron tier 2", async () => {
			const { id } = await UserFactory.create(null, { patronTier: 2 });

			const user = await UserRepository.findLeanById(id);

			expect(user?.roles).toContain("SUPPORTER");
			expect(user?.roles).toContain("MINOR_SUPPORT");
			expect(user?.roles).toContain("TOURNAMENT_ADDER");
			expect(user?.roles).toContain("CALENDAR_EVENT_ADDER");
			expect(user?.roles).toContain("API_ACCESSER");
		});

		test("returns PLUS_SERVER_MEMBER role for plus tier user", async () => {
			const { id } = await UserFactory.create(null, { plusTier: 1 });

			const user = await UserRepository.findLeanById(id);

			expect(user?.roles).toContain("PLUS_SERVER_MEMBER");
		});

		test("returns ARTIST role for artist user", async () => {
			const { id } = await UserFactory.create(null, { roles: ["ARTIST"] });

			const user = await UserRepository.findLeanById(id);

			expect(user?.roles).toContain("ARTIST");
		});

		test("returns VIDEO_ADDER role for video adder user", async () => {
			const { id } = await UserFactory.create(null, { roles: ["VIDEO_ADDER"] });

			const user = await UserRepository.findLeanById(id);

			expect(user?.roles).toContain("VIDEO_ADDER");
		});

		test("returns TOURNAMENT_ADDER and API_ACCESSER roles for tournament organizer", async () => {
			const { id } = await UserFactory.create(
				{},
				{ roles: ["TOURNAMENT_ORGANIZER"] },
			);

			const user = await UserRepository.findLeanById(id);

			expect(user?.roles).toContain("TOURNAMENT_ADDER");
			expect(user?.roles).toContain("API_ACCESSER");
		});

		test("returns API_ACCESSER role for api accesser user", async () => {
			const { id } = await UserFactory.create(null, {
				roles: ["API_ACCESSER"],
			});

			const user = await UserRepository.findLeanById(id);

			expect(user?.roles).toContain("API_ACCESSER");
		});

		test("returns CALENDAR_EVENT_ADDER role for aged discord account", async () => {
			const agedDiscordId = "79237403620945921";
			const { id } = await UserFactory.create({ discordId: agedDiscordId });

			const user = await UserRepository.findLeanById(id);

			expect(user?.roles).toContain("CALENDAR_EVENT_ADDER");
		});

		test("does not return CALENDAR_EVENT_ADDER role for new discord account", async () => {
			const recentDiscordId = String(
				(BigInt(Date.now() - 1420070400000) << 22n) + 1n,
			);

			const { id } = await UserFactory.create({
				discordId: recentDiscordId,
			});

			const user = await UserRepository.findLeanById(id);

			expect(user?.roles).not.toContain("CALENDAR_EVENT_ADDER");
		});

		test("returns multiple roles for user with multiple privileges", async () => {
			const { id } = await UserFactory.create(
				{},
				{
					patronTier: 2,
					plusTier: 2,
					roles: ["ARTIST", "VIDEO_ADDER"],
				},
			);

			const user = await UserRepository.findLeanById(id);

			expect(user?.roles).toContain("SUPPORTER");
			expect(user?.roles).toContain("MINOR_SUPPORT");
			expect(user?.roles).toContain("PLUS_SERVER_MEMBER");
			expect(user?.roles).toContain("ARTIST");
			expect(user?.roles).toContain("VIDEO_ADDER");
			expect(user?.roles).toContain("TOURNAMENT_ADDER");
			expect(user?.roles).toContain("CALENDAR_EVENT_ADDER");
			expect(user?.roles).toContain("API_ACCESSER");
		});
	});
});
