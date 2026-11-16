import { beforeEach, describe, expect, test } from "vitest";
import * as DiscordTokenFactory from "~/db/seed/factories/DiscordTokenFactory";
import * as UserFactory from "~/db/seed/factories/UserFactory";
import * as DiscordTokenRepository from "./DiscordTokenRepository.server";

const users = UserFactory.pool();

beforeEach(async () => {
	await users.create(2);
});

describe("DiscordTokenRepository.upsert", () => {
	test("replaces the tokens the user had before", async () => {
		await DiscordTokenFactory.create({ userId: users.id(1) });

		await DiscordTokenRepository.upsert({
			userId: users.id(1),
			accessToken: "new-access",
			refreshToken: "new-refresh",
			expiresAt: 123,
		});

		expect(await DiscordTokenRepository.findByUserId(users.id(1))).toEqual({
			accessToken: "new-access",
			refreshToken: "new-refresh",
			expiresAt: 123,
		});
		expect(await DiscordTokenRepository.findAllUserIds()).toEqual([
			users.id(1),
		]);
	});
});

describe("DiscordTokenRepository.deleteIfUnchanged", () => {
	test("deletes the tokens when the access token matches", async () => {
		const token = await DiscordTokenFactory.create({ userId: users.id(1) });

		await DiscordTokenRepository.deleteIfUnchanged({
			userId: users.id(1),
			accessToken: token.accessToken,
		});

		expect(
			await DiscordTokenRepository.findByUserId(users.id(1)),
		).toBeUndefined();
	});

	test("keeps tokens refreshed in the meantime", async () => {
		await DiscordTokenFactory.create({
			userId: users.id(1),
			accessToken: "refreshed",
		});

		await DiscordTokenRepository.deleteIfUnchanged({
			userId: users.id(1),
			accessToken: "stale",
		});

		expect(
			await DiscordTokenRepository.findByUserId(users.id(1)),
		).toBeDefined();
	});

	test("leaves other users' tokens alone", async () => {
		const token = await DiscordTokenFactory.create({ userId: users.id(1) });
		await DiscordTokenFactory.create({
			userId: users.id(2),
			accessToken: token.accessToken,
		});

		await DiscordTokenRepository.deleteIfUnchanged({
			userId: users.id(1),
			accessToken: token.accessToken,
		});

		expect(await DiscordTokenRepository.findAllUserIds()).toEqual([
			users.id(2),
		]);
	});
});
