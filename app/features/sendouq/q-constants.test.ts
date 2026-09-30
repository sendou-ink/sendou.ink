import { describe, expect, test } from "vitest";
import { FRIEND_CODE_REGEXP } from "./q-constants";

describe("FRIEND_CODE_REGEXP", () => {
	test.each(["SW-1234-5678-9012", "1234-5678-9012", "123456789012"])(
		"matches %s",
		(code) => {
			expect(FRIEND_CODE_REGEXP.test(code)).toBe(true);
		},
	);

	test.each(["SW-1234-5678-901", "1234-5678-901", "12345678901", "hello"])(
		"does not match %s",
		(code) => {
			expect(FRIEND_CODE_REGEXP.test(code)).toBe(false);
		},
	);
});
