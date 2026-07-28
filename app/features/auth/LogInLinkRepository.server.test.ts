import { beforeEach, describe, expect, test } from "vitest";
import * as LogInLinkFactory from "~/db/seed/factories/LogInLinkFactory";
import * as UserFactory from "~/db/seed/factories/UserFactory";
import * as LogInLinkRepository from "./LogInLinkRepository.server";

describe("create", () => {
	let userId: number;

	beforeEach(async () => {
		userId = (await UserFactory.create()).id;
	});

	test("creates a login link with correct userId", async () => {
		const link = await LogInLinkRepository.insert(userId);

		expect(link.userId).toBe(userId);
	});

	test("creates a login link with future expiration", async () => {
		const beforeCreation = Math.floor(Date.now() / 1000);
		const link = await LogInLinkRepository.insert(userId);

		expect(link.expiresAt).toBeGreaterThan(beforeCreation);
	});
});

describe("del", () => {
	let userId: number;

	beforeEach(async () => {
		userId = (await UserFactory.create()).id;
	});

	test("deletes a login link by code", async () => {
		const link = await LogInLinkFactory.create({ userId });

		await LogInLinkRepository.deleteByCode(link.code);

		const result = await LogInLinkRepository.findValidByCode(link.code);
		expect(result).toBeUndefined();
	});
});

describe("findValidByCode", () => {
	let userId: number;

	beforeEach(async () => {
		userId = (await UserFactory.create()).id;
	});

	test("returns userId for valid code", async () => {
		const link = await LogInLinkFactory.create({ userId });

		const result = await LogInLinkRepository.findValidByCode(link.code);

		expect(result?.userId).toBe(userId);
	});

	test("returns undefined for non-existent code", async () => {
		const result = await LogInLinkRepository.findValidByCode("nonexistent1");

		expect(result).toBeUndefined();
	});
});
