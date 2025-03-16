import { describe, expect, it } from "vitest";
import { FRIEND_CODE_REGEXP } from "./q-constants";

describe("FRIEND_CODE_REGEXP", () => {
	it("should match valid friend codes", () => {
		const validCodes = ["SW-1234-5678-9012", "1234-5678-9012", "123456789012"];
		for (const code of validCodes) {
			expect(FRIEND_CODE_REGEXP.test(code)).toBe(true);
		}
	});

	it("should not match invalid friend codes", () => {
		const invalidCodes = [
			"SW-1234-5678-901",
			"1234-5678-901",
			"12345678901",
			"hello",
		];
		for (const code of invalidCodes) {
			expect(FRIEND_CODE_REGEXP.test(code)).toBe(false);
		}
	});
});
