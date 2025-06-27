import { afterEach, describe, expect, test } from "vitest";
import { dbReset } from "~/utils/Test";
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
});
