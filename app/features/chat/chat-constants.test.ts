import { describe, expect, test } from "vitest";
import {
	extractRoomLink,
	findRoomLinks,
	isSplatnetRoomUrl,
} from "./chat-constants";

describe("isSplatnetRoomUrl", () => {
	test("accepts canonical SplatNet share path", () => {
		expect(
			isSplatnetRoomUrl(
				"https://s.nintendo.com/av5ja-lp1/znca/game/4834290508791808?p=%2Froom_creator%2Finvitation%2F1f14e24b-3c9e-6352-8a80-b7993ffad0d0",
			),
		).toBe(true);
	});

	test("accepts canonical SplatNet share path (no query params)", () => {
		expect(isSplatnetRoomUrl("https://s.nintendo.com/av5ja-lp1/abc123")).toBe(
			true,
		);
	});

	test("accepts a simple alphanumeric path", () => {
		expect(isSplatnetRoomUrl("https://s.nintendo.com/abcdef")).toBe(true);
	});

	test("rejects http (non-https)", () => {
		expect(isSplatnetRoomUrl("http://s.nintendo.com/abc")).toBe(false);
	});

	test("rejects unescaped-dot lookalike host (sanintendoacom.evil.tld)", () => {
		expect(isSplatnetRoomUrl("https://sanintendoacom.evil.tld/lobby")).toBe(
			false,
		);
	});

	test("rejects dash variant host (s-nintendo-com.evil.tld)", () => {
		expect(isSplatnetRoomUrl("https://s-nintendo-com.evil.tld/lobby")).toBe(
			false,
		);
	});

	test("rejects userinfo in URL (s.nintendo.com@evil.com)", () => {
		expect(isSplatnetRoomUrl("https://s.nintendo.com@evil.com/abc")).toBe(
			false,
		);
	});

	test("rejects custom port", () => {
		expect(isSplatnetRoomUrl("https://s.nintendo.com:8080/abc")).toBe(false);
	});

	test("rejects query string", () => {
		expect(
			isSplatnetRoomUrl("https://s.nintendo.com/abc?redirect=evil.com"),
		).toBe(false);
	});

	test("rejects fragment", () => {
		expect(isSplatnetRoomUrl("https://s.nintendo.com/abc#@evil.com")).toBe(
			false,
		);
	});

	test("rejects trailing dot in hostname", () => {
		expect(isSplatnetRoomUrl("https://s.nintendo.com./abc")).toBe(false);
	});

	test("rejects empty path", () => {
		expect(isSplatnetRoomUrl("https://s.nintendo.com/")).toBe(false);
	});

	test("rejects path with disallowed characters", () => {
		expect(isSplatnetRoomUrl("https://s.nintendo.com/abc!def")).toBe(false);
	});

	test("rejects malformed URL", () => {
		expect(isSplatnetRoomUrl("not a url")).toBe(false);
	});
});

describe("findRoomLinks", () => {
	test("returns empty array when no links", () => {
		expect(findRoomLinks("just chatting here")).toEqual([]);
	});

	test("finds a valid link with its index", () => {
		const text = "join: https://s.nintendo.com/abc123 thanks";
		expect(findRoomLinks(text)).toEqual([
			{ url: "https://s.nintendo.com/abc123", index: 6 },
		]);
	});

	test("ignores spoofed lookalike hosts even when surrounding text matches the candidate regex", () => {
		const text = "join here https://sanintendoacom.evil.tld/lobby right now";
		expect(findRoomLinks(text)).toEqual([]);
	});

	test("ignores links with query strings", () => {
		const text =
			"https://s.nintendo.com/abc?redirect=https://evil.com legitimate?";
		expect(findRoomLinks(text)).toEqual([]);
	});

	test("returns multiple valid links", () => {
		const text =
			"https://s.nintendo.com/aaa and also https://s.nintendo.com/bbb";
		expect(findRoomLinks(text)).toEqual([
			{ url: "https://s.nintendo.com/aaa", index: 0 },
			{ url: "https://s.nintendo.com/bbb", index: 36 },
		]);
	});
});

describe("extractRoomLink", () => {
	test("returns first valid link", () => {
		expect(extractRoomLink("hi https://s.nintendo.com/abc see you")).toBe(
			"https://s.nintendo.com/abc",
		);
	});

	test("returns null when no valid link present", () => {
		expect(extractRoomLink("https://sanintendoacom.evil.tld/abc")).toBeNull();
	});
});
