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
		const result = await ApiRepository.findTokenByUserId(1, "read");

		expect(result).toBeUndefined();
	});

	test("finds existing token for user", async () => {
		await ApiRepository.generateToken(1, "read");

		const result = await ApiRepository.findTokenByUserId(1, "read");

		expect(result).toBeDefined();
		expect(result?.userId).toBe(1);
		expect(result?.token).toBeDefined();
	});

	test("returns correct token for specific user", async () => {
		const token1 = await ApiRepository.generateToken(1, "read");
		const token2 = await ApiRepository.generateToken(2, "read");

		const result1 = await ApiRepository.findTokenByUserId(1, "read");
		const result2 = await ApiRepository.findTokenByUserId(2, "read");

		expect(result1?.token).toBe(token1.token);
		expect(result2?.token).toBe(token2.token);
		expect(result1?.token).not.toBe(result2?.token);
	});

	test("finds correct token by type", async () => {
		await ApiRepository.generateToken(1, "read");
		await ApiRepository.generateToken(1, "write");

		const readResult = await ApiRepository.findTokenByUserId(1, "read");
		const writeResult = await ApiRepository.findTokenByUserId(1, "write");

		expect(readResult).toBeDefined();
		expect(writeResult).toBeDefined();
		expect(readResult?.token).not.toBe(writeResult?.token);
		expect(readResult?.type).toBe("read");
		expect(writeResult?.type).toBe("write");
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
		const result = await ApiRepository.generateToken(1, "read");

		expect(result.token).toBeDefined();
		expect(typeof result.token).toBe("string");
		expect(result.token.length).toBeGreaterThan(0);
	});

	test("deletes existing token before creating new one", async () => {
		const firstToken = await ApiRepository.generateToken(1, "read");
		const secondToken = await ApiRepository.generateToken(1, "read");

		expect(firstToken.token).not.toBe(secondToken.token);

		const storedToken = await ApiRepository.findTokenByUserId(1, "read");
		expect(storedToken?.token).toBe(secondToken.token);
	});

	test("generates unique tokens for different users", async () => {
		const token1 = await ApiRepository.generateToken(1, "read");
		const token2 = await ApiRepository.generateToken(2, "read");
		const token3 = await ApiRepository.generateToken(3, "read");

		expect(token1.token).not.toBe(token2.token);
		expect(token1.token).not.toBe(token3.token);
		expect(token2.token).not.toBe(token3.token);
	});

	test("replaces only the specific user's token", async () => {
		const user1FirstToken = await ApiRepository.generateToken(1, "read");
		const user2Token = await ApiRepository.generateToken(2, "read");
		const user1SecondToken = await ApiRepository.generateToken(1, "read");

		const result1 = await ApiRepository.findTokenByUserId(1, "read");
		const result2 = await ApiRepository.findTokenByUserId(2, "read");

		expect(result1?.token).toBe(user1SecondToken.token);
		expect(result1?.token).not.toBe(user1FirstToken.token);
		expect(result2?.token).toBe(user2Token.token);
	});

	test("allows same user to have both read and write tokens", async () => {
		const readToken = await ApiRepository.generateToken(1, "read");
		const writeToken = await ApiRepository.generateToken(1, "write");

		const readResult = await ApiRepository.findTokenByUserId(1, "read");
		const writeResult = await ApiRepository.findTokenByUserId(1, "write");

		expect(readResult?.token).toBe(readToken.token);
		expect(writeResult?.token).toBe(writeToken.token);
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

	test("returns array of token objects with type", async () => {
		await ApiRepository.generateToken(1, "read");

		const result = await ApiRepository.allApiTokens();

		expect(Array.isArray(result)).toBe(true);
		expect(
			result.every(
				(item) =>
					typeof item.token === "string" && typeof item.type === "string",
			),
		).toBe(true);
	});
});
