import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { dbInsertUsers, dbReset } from "~/utils/Test";
import * as ApiRepository from "./ApiRepository.server";

describe("findTokenByUserId", () => {
	beforeEach(async () => {
		await dbInsertUsers(3);
	});

	afterEach(() => {
		dbReset();
	});

	test("returns undefined when user has no token", async () => {
		const result = await ApiRepository.findTokenByUserId(1);

		expect(result).toBeUndefined();
	});

	test("finds existing token for user", async () => {
		await ApiRepository.generateToken(1);

		const result = await ApiRepository.findTokenByUserId(1);

		expect(result).toBeDefined();
		expect(result?.userId).toBe(1);
		expect(result?.token).toBeDefined();
	});

	test("returns correct token for specific user", async () => {
		const token1 = await ApiRepository.generateToken(1);
		const token2 = await ApiRepository.generateToken(2);

		const result1 = await ApiRepository.findTokenByUserId(1);
		const result2 = await ApiRepository.findTokenByUserId(2);

		expect(result1?.token).toBe(token1.token);
		expect(result2?.token).toBe(token2.token);
		expect(result1?.token).not.toBe(result2?.token);
	});
});

describe("generateToken", () => {
	beforeEach(async () => {
		await dbInsertUsers(3);
	});

	afterEach(() => {
		dbReset();
	});

	test("creates new token for user", async () => {
		const result = await ApiRepository.generateToken(1);

		expect(result.token).toBeDefined();
		expect(typeof result.token).toBe("string");
		expect(result.token.length).toBeGreaterThan(0);
	});

	test("deletes existing token before creating new one", async () => {
		const firstToken = await ApiRepository.generateToken(1);
		const secondToken = await ApiRepository.generateToken(1);

		expect(firstToken.token).not.toBe(secondToken.token);

		const storedToken = await ApiRepository.findTokenByUserId(1);
		expect(storedToken?.token).toBe(secondToken.token);
	});

	test("generates unique tokens for different users", async () => {
		const token1 = await ApiRepository.generateToken(1);
		const token2 = await ApiRepository.generateToken(2);
		const token3 = await ApiRepository.generateToken(3);

		expect(token1.token).not.toBe(token2.token);
		expect(token1.token).not.toBe(token3.token);
		expect(token2.token).not.toBe(token3.token);
	});

	test("replaces only the specific user's token", async () => {
		const user1FirstToken = await ApiRepository.generateToken(1);
		const user2Token = await ApiRepository.generateToken(2);
		const user1SecondToken = await ApiRepository.generateToken(1);

		const result1 = await ApiRepository.findTokenByUserId(1);
		const result2 = await ApiRepository.findTokenByUserId(2);

		expect(result1?.token).toBe(user1SecondToken.token);
		expect(result1?.token).not.toBe(user1FirstToken.token);
		expect(result2?.token).toBe(user2Token.token);
	});
});

describe("allApiTokens", () => {
	beforeEach(async () => {
		await dbInsertUsers(1);
	});

	afterEach(() => {
		dbReset();
	});

	test("returns empty array when no tokens exist", async () => {
		const result = await ApiRepository.allApiTokens();

		expect(result).toEqual([]);
	});

	test("returns array of token strings", async () => {
		await ApiRepository.generateToken(1);

		const result = await ApiRepository.allApiTokens();

		expect(Array.isArray(result)).toBe(true);
		expect(result.every((token) => typeof token === "string")).toBe(true);
	});
});
