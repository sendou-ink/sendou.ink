import { describe, expect, test } from "vitest";
import { findRoomLinks, isSplatnetRoomUrl } from "./chat-constants";

describe("isSplatnetRoomUrl", () => {
	test.each([
		"https://s.nintendo.com/av5ja-lp1/znca/game/4834290508791808?p=%2Froom_creator%2Finvitation%2F1f14e24b-3c9e-6352-8a80-b7993ffad0d0",
		"https://s.nintendo.com/av5ja-lp1/abc123",
		"https://s.nintendo.com/abcdef",
	])("accepts %s", (url) => {
		expect(isSplatnetRoomUrl(url)).toBe(true);
	});

	test.each([
		["http://s.nintendo.com/abc", "http, not https"],
		["https://sanintendoacom.evil.tld/lobby", "unescaped-dot lookalike host"],
		["https://s-nintendo-com.evil.tld/lobby", "dash variant host"],
		["https://s.nintendo.com@evil.com/abc", "userinfo in the URL"],
		["https://s.nintendo.com:8080/abc", "custom port"],
		["https://s.nintendo.com/abc?redirect=evil.com", "query string"],
		["https://s.nintendo.com/abc#@evil.com", "fragment"],
		["https://s.nintendo.com./abc", "trailing dot in the hostname"],
		["https://s.nintendo.com/", "empty path"],
		["https://s.nintendo.com/abc!def", "disallowed characters in the path"],
		["not a url", "malformed URL"],
	])("rejects %s (%s)", (url) => {
		expect(isSplatnetRoomUrl(url)).toBe(false);
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
