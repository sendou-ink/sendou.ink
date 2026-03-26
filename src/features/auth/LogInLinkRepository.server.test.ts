import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { dbInsertUsers, dbReset } from "~/utils/Test";
import * as LogInLinkRepository from "./LogInLinkRepository.server";

describe("create", () => {
	beforeEach(async () => {
		await dbInsertUsers(1);
	});

	afterEach(() => {
		dbReset();
	});

	test("creates a login link with correct userId", async () => {
		const link = await LogInLinkRepository.create(1);

		expect(link.userId).toBe(1);
	});

	test("creates a login link with future expiration", async () => {
		const beforeCreation = Math.floor(Date.now() / 1000);
		const link = await LogInLinkRepository.create(1);

		expect(link.expiresAt).toBeGreaterThan(beforeCreation);
	});
});

describe("del", () => {
	beforeEach(async () => {
		await dbInsertUsers(1);
	});

	afterEach(() => {
		dbReset();
	});

	test("deletes a login link by code", async () => {
		const link = await LogInLinkRepository.create(1);

		await LogInLinkRepository.del(link.code);

		const result = await LogInLinkRepository.findValidByCode(link.code);
		expect(result).toBeUndefined();
	});
});

describe("findValidByCode", () => {
	beforeEach(async () => {
		await dbInsertUsers(1);
	});

	afterEach(() => {
		dbReset();
	});

	test("returns userId for valid code", async () => {
		const link = await LogInLinkRepository.create(1);

		const result = await LogInLinkRepository.findValidByCode(link.code);

		expect(result?.userId).toBe(1);
	});

	test("returns undefined for non-existent code", async () => {
		const result = await LogInLinkRepository.findValidByCode("nonexistent1");

		expect(result).toBeUndefined();
	});
});
