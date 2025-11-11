import { afterEach, describe, expect, test } from "vitest";
import { dbReset } from "~/utils/Test";
import * as AdminRepository from "../admin/AdminRepository.server";
import * as UserRepository from "./UserRepository.server";

describe("UserRepository", () => {
	afterEach(() => {
		dbReset();
	});

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

	describe("userRoles", () => {
		test("returns empty array for basic user", async () => {
			await UserRepository.upsert({
				discordId: "79237403620945920",
				discordName: "DummyAdmin",
				discordAvatar: null,
			});

			const recentDiscordId = String(
				(BigInt(Date.now() - 1420070400000) << 22n) + 1n,
			);
			const { id } = await UserRepository.upsert({
				discordId: recentDiscordId,
				discordName: "RegularUser",
				discordAvatar: null,
			});

			const user = await UserRepository.findLeanById(id);

			expect(user?.roles).toEqual([]);
		});

		test("returns ADMIN and STAFF roles for admin user", async () => {
			const { id } = await UserRepository.upsert({
				discordId: "79237403620945920",
				discordName: "AdminUser",
				discordAvatar: null,
			});

			const user = await UserRepository.findLeanById(id);

			expect(user?.roles).toContain("ADMIN");
			expect(user?.roles).toContain("STAFF");
		});

		test("returns MINOR_SUPPORT role for patron tier 1", async () => {
			const { id } = await UserRepository.upsert({
				discordId: "79237403620945921",
				discordName: "PatronUser",
				discordAvatar: null,
			});

			const now = new Date();
			const oneYearFromNow = new Date(
				now.getTime() + 365 * 24 * 60 * 60 * 1000,
			);
			await AdminRepository.forcePatron({
				id,
				patronTier: 1,
				patronSince: now,
				patronTill: oneYearFromNow,
			});

			const user = await UserRepository.findLeanById(id);

			expect(user?.roles).toContain("MINOR_SUPPORT");
			expect(user?.roles).not.toContain("SUPPORTER");
		});

		test("returns SUPPORTER, MINOR_SUPPORT, TOURNAMENT_ADDER, CALENDAR_EVENT_ADDER, and API_ACCESSER roles for patron tier 2", async () => {
			const { id } = await UserRepository.upsert({
				discordId: "79237403620945921",
				discordName: "SupporterUser",
				discordAvatar: null,
			});

			const now = new Date();
			const oneYearFromNow = new Date(
				now.getTime() + 365 * 24 * 60 * 60 * 1000,
			);
			await AdminRepository.forcePatron({
				id,
				patronTier: 2,
				patronSince: now,
				patronTill: oneYearFromNow,
			});

			const user = await UserRepository.findLeanById(id);

			expect(user?.roles).toContain("SUPPORTER");
			expect(user?.roles).toContain("MINOR_SUPPORT");
			expect(user?.roles).toContain("TOURNAMENT_ADDER");
			expect(user?.roles).toContain("CALENDAR_EVENT_ADDER");
			expect(user?.roles).toContain("API_ACCESSER");
		});

		test("returns PLUS_SERVER_MEMBER role for plus tier user", async () => {
			const { id } = await UserRepository.upsert({
				discordId: "79237403620945921",
				discordName: "PlusUser",
				discordAvatar: null,
			});

			await AdminRepository.replacePlusTiers([{ userId: id, plusTier: 1 }]);

			const user = await UserRepository.findLeanById(id);

			expect(user?.roles).toContain("PLUS_SERVER_MEMBER");
		});

		test("returns ARTIST role for artist user", async () => {
			const { id } = await UserRepository.upsert({
				discordId: "79237403620945921",
				discordName: "ArtistUser",
				discordAvatar: null,
			});

			await AdminRepository.makeArtistByUserId(id);

			const user = await UserRepository.findLeanById(id);

			expect(user?.roles).toContain("ARTIST");
		});

		test("returns VIDEO_ADDER role for video adder user", async () => {
			const { id } = await UserRepository.upsert({
				discordId: "79237403620945921",
				discordName: "VideoAdderUser",
				discordAvatar: null,
			});

			await AdminRepository.makeVideoAdderByUserId(id);

			const user = await UserRepository.findLeanById(id);

			expect(user?.roles).toContain("VIDEO_ADDER");
		});

		test("returns TOURNAMENT_ADDER and API_ACCESSER roles for tournament organizer", async () => {
			const { id } = await UserRepository.upsert({
				discordId: "79237403620945921",
				discordName: "OrganizerUser",
				discordAvatar: null,
			});

			await AdminRepository.makeTournamentOrganizerByUserId(id);

			const user = await UserRepository.findLeanById(id);

			expect(user?.roles).toContain("TOURNAMENT_ADDER");
			expect(user?.roles).toContain("API_ACCESSER");
		});

		test("returns API_ACCESSER role for api accesser user", async () => {
			const { id } = await UserRepository.upsert({
				discordId: "79237403620945921",
				discordName: "ApiUser",
				discordAvatar: null,
			});

			await AdminRepository.makeApiAccesserByUserId(id);

			const user = await UserRepository.findLeanById(id);

			expect(user?.roles).toContain("API_ACCESSER");
		});

		test("returns CALENDAR_EVENT_ADDER role for aged discord account", async () => {
			const agedDiscordId = "79237403620945921";
			const { id } = await UserRepository.upsert({
				discordId: agedDiscordId,
				discordName: "AgedUser",
				discordAvatar: null,
			});

			const user = await UserRepository.findLeanById(id);

			expect(user?.roles).toContain("CALENDAR_EVENT_ADDER");
		});

		test("does not return CALENDAR_EVENT_ADDER role for new discord account", async () => {
			const recentDiscordId = String(
				(BigInt(Date.now() - 1420070400000) << 22n) + 1n,
			);

			const { id } = await UserRepository.upsert({
				discordId: recentDiscordId,
				discordName: "NewUser",
				discordAvatar: null,
			});

			const user = await UserRepository.findLeanById(id);

			expect(user?.roles).not.toContain("CALENDAR_EVENT_ADDER");
		});

		test("returns multiple roles for user with multiple privileges", async () => {
			const { id } = await UserRepository.upsert({
				discordId: "79237403620945920",
				discordName: "MultiRoleUser",
				discordAvatar: null,
			});

			const now = new Date();
			const oneYearFromNow = new Date(
				now.getTime() + 365 * 24 * 60 * 60 * 1000,
			);
			await AdminRepository.forcePatron({
				id,
				patronTier: 2,
				patronSince: now,
				patronTill: oneYearFromNow,
			});

			await AdminRepository.makeArtistByUserId(id);
			await AdminRepository.makeVideoAdderByUserId(id);
			await AdminRepository.replacePlusTiers([{ userId: id, plusTier: 2 }]);

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
