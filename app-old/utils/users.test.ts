import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { queryToUserIdentifier, userDiscordIdIsAged } from "./users";

describe("queryToUserIdentifier()", () => {
	test("returns null if no match", () => {
		expect(queryToUserIdentifier("foo")).toBe(null);
	});

	test("gets custom url from url", () => {
		expect(queryToUserIdentifier("https://sendou.ink/u/sendou")).toEqual({
			customUrl: "sendou",
		});
	});

	test("gets discord id from url", () => {
		expect(
			queryToUserIdentifier("https://sendou.ink/u/79237403620945920"),
		).toEqual({
			discordId: "79237403620945920",
		});
	});

	test("gets custom url from url (without https://)", () => {
		expect(queryToUserIdentifier("sendou.ink/u/sendou")).toEqual({
			customUrl: "sendou",
		});
	});

	test("gets discord id", () => {
		expect(queryToUserIdentifier("79237403620945920")).toEqual({
			discordId: "79237403620945920",
		});
	});

	test("gets id", () => {
		expect(queryToUserIdentifier("1")).toEqual({
			id: 1,
		});
	});
});

describe("userDiscordIdIsAged()", () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2023-11-25T00:00:00.000Z"));
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	test("returns false if discord id is not aged", () => {
		expect(userDiscordIdIsAged({ discordId: "1177730652641181871" })).toBe(
			false,
		);
	});

	test("returns true if discord id is aged", () => {
		expect(userDiscordIdIsAged({ discordId: "79237403620945920" })).toBe(true);
	});

	test("throws error if discord id missing", () => {
		expect(() => userDiscordIdIsAged({ discordId: "" })).toThrow();
	});

	test("throws error if discord id too short", () => {
		expect(() => userDiscordIdIsAged({ discordId: "1234" })).toThrow();
	});
});
