import { describe, expect, it } from "vitest";
import { hasZalgo, normalizeFriendCode } from "./zod";

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
