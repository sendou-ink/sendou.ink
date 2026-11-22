import { beforeEach, describe, expect, test } from "vitest";
import * as UserFactory from "~/db/seed/factories/UserFactory";
import { withUserId } from "~/utils/Test";
import * as CalendarFeedRepository from "./CalendarFeedRepository.server";

const users = UserFactory.pool();

beforeEach(async () => {
	await users.create(2);
});

describe("upsertOwnToken", () => {
	test("creates a token that opens the user's feed", async () => {
		await withUserId(users.id(1), () =>
			CalendarFeedRepository.upsertOwnToken(),
		);

		const token = await withUserId(users.id(1), () =>
			CalendarFeedRepository.findOwnToken(),
		);
		if (!token) throw new Error("token missing");

		expect(await CalendarFeedRepository.findUserIdByToken(token)).toBe(
			users.id(1),
		);
	});

	test("resetting replaces the token so the old one no longer opens the feed", async () => {
		await withUserId(users.id(1), () =>
			CalendarFeedRepository.upsertOwnToken(),
		);
		const oldToken = await withUserId(users.id(1), () =>
			CalendarFeedRepository.findOwnToken(),
		);
		if (!oldToken) throw new Error("token missing");

		await withUserId(users.id(1), () =>
			CalendarFeedRepository.upsertOwnToken(),
		);
		const newToken = await withUserId(users.id(1), () =>
			CalendarFeedRepository.findOwnToken(),
		);

		expect(newToken).not.toBe(oldToken);
		expect(
			await CalendarFeedRepository.findUserIdByToken(oldToken),
		).toBeUndefined();
	});

	test("doesn't touch other users' tokens", async () => {
		await withUserId(users.id(1), () =>
			CalendarFeedRepository.upsertOwnToken(),
		);

		expect(
			await withUserId(users.id(2), () =>
				CalendarFeedRepository.findOwnToken(),
			),
		).toBeUndefined();
	});
});

describe("findUserIdByToken", () => {
	test("returns undefined for an unknown token", async () => {
		expect(
			await CalendarFeedRepository.findUserIdByToken("unknown"),
		).toBeUndefined();
	});
});
