import { describe, expect, it } from "vitest";
import {
	actuallyNonEmptyStringOrNull,
	hasZalgo,
	normalizeFriendCode,
	timeString,
} from "./zod";

describe("normalizeFriendCode", () => {
	it("returns well formatted friend code as is", () => {
		expect(normalizeFriendCode("1234-5678-9012")).toBe("1234-5678-9012");
	});

	it("handles no dashes", () => {
		expect(normalizeFriendCode("123456789012")).toBe("1234-5678-9012");
	});

	it("handles SW-suffix", () => {
		expect(normalizeFriendCode("SW-1234-5678-9012")).toBe("1234-5678-9012");
	});

	it("handles a mix", () => {
		expect(normalizeFriendCode("SW-1234-56789012")).toBe("1234-5678-9012");
	});
});

describe("hasZalgo", () => {
	it("returns true for text containing Zalgo characters", () => {
		expect(hasZalgo("z͎͗ͣḁ̵̑l̉̃ͦg̐̓̒o͓̔ͥ")).toBe(true);
	});

	it("returns false for text without Zalgo characters", () => {
		expect(hasZalgo("normal text")).toBe(false);
	});

	it("returns false for an empty string", () => {
		expect(hasZalgo("")).toBe(false);
	});

	it("returns false for text with special but non-Zalgo characters", () => {
		expect(hasZalgo("!@#$%^&*()")).toBe(false);
	});

	it("accepts japanese characters", () => {
		expect(hasZalgo("こんにちは")).toBe(false);
	});
});

describe("actuallyNonEmptyStringOrNull", () => {
	it("returns null for an empty string", () => {
		expect(actuallyNonEmptyStringOrNull("")).toBeNull();
	});

	it("returns null for a string with only spaces", () => {
		expect(actuallyNonEmptyStringOrNull("    ")).toBeNull();
	});

	it("returns trimmed string for a string with visible characters and spaces", () => {
		expect(actuallyNonEmptyStringOrNull("  hello world  ")).toBe("hello world");
	});

	it("removes invisible characters and trims", () => {
		expect(actuallyNonEmptyStringOrNull("​​​​test​​​​")).toBe("test");
	});

	it("returns original value if not a string", () => {
		expect(actuallyNonEmptyStringOrNull(123)).toBe(123);
		expect(actuallyNonEmptyStringOrNull(null)).toBe(null);
		expect(actuallyNonEmptyStringOrNull(undefined)).toBe(undefined);
		expect(actuallyNonEmptyStringOrNull({})).toEqual({});
	});

	it("returns null for a string with only zero width spaces", () => {
		expect(actuallyNonEmptyStringOrNull("​​​​​​​​​​")).toBeNull();
	});

	it("returns null for a string with only tag space emoji", () => {
		expect(actuallyNonEmptyStringOrNull("󠀠󠀠󠀠󠀠󠀠")).toBeNull();
	});

	it("returns null for a string with only Hangul Filler", () => {
		expect(actuallyNonEmptyStringOrNull("\u3164")).toBeNull();
		expect(actuallyNonEmptyStringOrNull("ㅤㅤㅤ")).toBeNull();
	});

	it("returns null for other invisible characters", () => {
		expect(actuallyNonEmptyStringOrNull("\u115F")).toBeNull();
		expect(actuallyNonEmptyStringOrNull("\u1160")).toBeNull();
		expect(actuallyNonEmptyStringOrNull("\uFEFF")).toBeNull();
		expect(actuallyNonEmptyStringOrNull("\u2060")).toBeNull();
	});
});

describe("timeString", () => {
	it("accepts valid time in HH:MM format", () => {
		expect(timeString.safeParse("00:00").success).toBe(true);
		expect(timeString.safeParse("12:30").success).toBe(true);
		expect(timeString.safeParse("23:59").success).toBe(true);
	});

	it("accepts times with leading zeros", () => {
		expect(timeString.safeParse("01:05").success).toBe(true);
		expect(timeString.safeParse("09:00").success).toBe(true);
	});

	it("rejects invalid hour values", () => {
		expect(timeString.safeParse("24:00").success).toBe(false);
		expect(timeString.safeParse("25:30").success).toBe(false);
		expect(timeString.safeParse("99:00").success).toBe(false);
	});

	it("rejects invalid minute values", () => {
		expect(timeString.safeParse("12:60").success).toBe(false);
		expect(timeString.safeParse("12:99").success).toBe(false);
	});

	it("rejects malformed time strings", () => {
		expect(timeString.safeParse("1:30").success).toBe(false);
		expect(timeString.safeParse("12:3").success).toBe(false);
		expect(timeString.safeParse("12-30").success).toBe(false);
		expect(timeString.safeParse("1230").success).toBe(false);
		expect(timeString.safeParse("12:30:00").success).toBe(false);
	});

	it("rejects non-string values", () => {
		expect(timeString.safeParse(1230).success).toBe(false);
		expect(timeString.safeParse(null).success).toBe(false);
		expect(timeString.safeParse(undefined).success).toBe(false);
	});

	it("rejects empty string", () => {
		expect(timeString.safeParse("").success).toBe(false);
	});
});
