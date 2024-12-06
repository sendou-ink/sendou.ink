import { describe, expect, it } from "vitest";
import { normalizeFriendCode } from "./zod";

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
