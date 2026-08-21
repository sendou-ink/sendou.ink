import * as v from "valibot";
import { describe, expect, test } from "vitest";
import {
	actuallyNonEmptyStringOrNull,
	hasZalgo,
	hexCodeWithoutAlpha,
	normalizeFriendCode,
	timeString,
} from "./schema";

describe("normalizeFriendCode", () => {
	test("returns well formatted friend code as is", () => {
		expect(normalizeFriendCode("1234-5678-9012")).toBe("1234-5678-9012");
	});

	test("handles no dashes", () => {
		expect(normalizeFriendCode("123456789012")).toBe("1234-5678-9012");
	});

	test("handles SW-suffix", () => {
		expect(normalizeFriendCode("SW-1234-5678-9012")).toBe("1234-5678-9012");
	});

	test("handles a mix", () => {
		expect(normalizeFriendCode("SW-1234-56789012")).toBe("1234-5678-9012");
	});
});

describe("hasZalgo", () => {
	test("returns true for text containing Zalgo characters", () => {
		expect(hasZalgo("z͎͗ͣḁ̵̑l̉̃ͦg̐̓̒o͓̔ͥ")).toBe(true);
	});

	test("returns false for text without Zalgo characters", () => {
		expect(hasZalgo("normal text")).toBe(false);
	});

	test("returns false for an empty string", () => {
		expect(hasZalgo("")).toBe(false);
	});

	test("returns false for text with special but non-Zalgo characters", () => {
		expect(hasZalgo("!@#$%^&*()")).toBe(false);
	});

	test("accepts japanese characters", () => {
		expect(hasZalgo("こんにちは")).toBe(false);
	});

	test("returns a stable result when called repeatedly with the same input", () => {
		const withCombiningMark = "á"; // "á" as base letter + single combining accent

		expect(hasZalgo(withCombiningMark)).toBe(true);
		expect(hasZalgo(withCombiningMark)).toBe(true);
	});
});

describe("actuallyNonEmptyStringOrNull", () => {
	test("returns null for an empty string", () => {
		expect(actuallyNonEmptyStringOrNull("")).toBeNull();
	});

	test("returns null for a string with only spaces", () => {
		expect(actuallyNonEmptyStringOrNull("    ")).toBeNull();
	});

	test("returns trimmed string for a string with visible characters and spaces", () => {
		expect(actuallyNonEmptyStringOrNull("  hello world  ")).toBe("hello world");
	});

	test("removes invisible characters and trims", () => {
		expect(actuallyNonEmptyStringOrNull("​​​​test​​​​")).toBe("test");
	});

	test("returns original value if not a string", () => {
		expect(actuallyNonEmptyStringOrNull(123)).toBe(123);
		expect(actuallyNonEmptyStringOrNull(null)).toBe(null);
		expect(actuallyNonEmptyStringOrNull(undefined)).toBe(undefined);
		expect(actuallyNonEmptyStringOrNull({})).toEqual({});
	});

	test("returns null for a string with only zero width spaces", () => {
		expect(actuallyNonEmptyStringOrNull("​​​​​​​​​​")).toBeNull();
	});

	test("returns null for a string with only tag space emoji", () => {
		expect(actuallyNonEmptyStringOrNull("󠀠󠀠󠀠󠀠󠀠")).toBeNull();
	});

	test("returns null for a string with only Hangul Filler", () => {
		expect(actuallyNonEmptyStringOrNull("\u3164")).toBeNull();
		expect(actuallyNonEmptyStringOrNull("ㅤㅤㅤ")).toBeNull();
	});

	test("returns null for other invisible characters", () => {
		expect(actuallyNonEmptyStringOrNull("\u115F")).toBeNull();
		expect(actuallyNonEmptyStringOrNull("\u1160")).toBeNull();
		expect(actuallyNonEmptyStringOrNull("\uFEFF")).toBeNull();
		expect(actuallyNonEmptyStringOrNull("\u2060")).toBeNull();
	});

	test("returns null for a string with only soft hyphens", () => {
		expect(actuallyNonEmptyStringOrNull("\u00AD")).toBeNull();
		expect(actuallyNonEmptyStringOrNull("\u00AD\u00AD\u00AD")).toBeNull();
	});

	test("returns null for a string with only braille blanks", () => {
		expect(actuallyNonEmptyStringOrNull("\u2800")).toBeNull();
		expect(actuallyNonEmptyStringOrNull("\u2800\u2800\u2800\u2800")).toBeNull();
	});

	test("returns null for a string with only variation selectors", () => {
		expect(actuallyNonEmptyStringOrNull("\ufe0e")).toBeNull();
		expect(actuallyNonEmptyStringOrNull("\ufe0e\ufe0e")).toBeNull();
	});
});

describe("hexCodeWithoutAlpha", () => {
	test("accepts valid 3 and 6 digit hex colors", () => {
		expect(v.safeParse(hexCodeWithoutAlpha, "#fff").success).toBe(true);
		expect(v.safeParse(hexCodeWithoutAlpha, "#FFF").success).toBe(true);
		expect(v.safeParse(hexCodeWithoutAlpha, "#abc").success).toBe(true);
		expect(v.safeParse(hexCodeWithoutAlpha, "#ffffff").success).toBe(true);
		expect(v.safeParse(hexCodeWithoutAlpha, "#a1b2c3").success).toBe(true);
	});

	test("rejects strings that are not valid hex colors", () => {
		expect(v.safeParse(hexCodeWithoutAlpha, "#fff99").success).toBe(false);
		expect(v.safeParse(hexCodeWithoutAlpha, "#abc12").success).toBe(false);
		expect(v.safeParse(hexCodeWithoutAlpha, "#12345").success).toBe(false);
		expect(v.safeParse(hexCodeWithoutAlpha, "#ffffff99").success).toBe(false);
	});

	test("rejects alpha (4 and 8 digit) hex colors", () => {
		expect(v.safeParse(hexCodeWithoutAlpha, "#ffff").success).toBe(false);
		expect(v.safeParse(hexCodeWithoutAlpha, "#ffffffff").success).toBe(false);
	});
});

describe("timeString", () => {
	test("accepts valid time in HH:MM format", () => {
		expect(v.safeParse(timeString, "00:00").success).toBe(true);
		expect(v.safeParse(timeString, "12:30").success).toBe(true);
		expect(v.safeParse(timeString, "23:59").success).toBe(true);
	});

	test("accepts times with leading zeros", () => {
		expect(v.safeParse(timeString, "01:05").success).toBe(true);
		expect(v.safeParse(timeString, "09:00").success).toBe(true);
	});

	test("rejects invalid hour values", () => {
		expect(v.safeParse(timeString, "24:00").success).toBe(false);
		expect(v.safeParse(timeString, "25:30").success).toBe(false);
		expect(v.safeParse(timeString, "99:00").success).toBe(false);
	});

	test("rejects invalid minute values", () => {
		expect(v.safeParse(timeString, "12:60").success).toBe(false);
		expect(v.safeParse(timeString, "12:99").success).toBe(false);
	});

	test("rejects malformed time strings", () => {
		expect(v.safeParse(timeString, "1:30").success).toBe(false);
		expect(v.safeParse(timeString, "12:3").success).toBe(false);
		expect(v.safeParse(timeString, "12-30").success).toBe(false);
		expect(v.safeParse(timeString, "1230").success).toBe(false);
		expect(v.safeParse(timeString, "12:30:00").success).toBe(false);
	});

	test("rejects non-string values", () => {
		expect(v.safeParse(timeString, 1230).success).toBe(false);
		expect(v.safeParse(timeString, null).success).toBe(false);
		expect(v.safeParse(timeString, undefined).success).toBe(false);
	});

	test("rejects empty string", () => {
		expect(v.safeParse(timeString, "").success).toBe(false);
	});
});
