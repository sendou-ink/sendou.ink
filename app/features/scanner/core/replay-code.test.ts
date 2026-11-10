import { describe, expect, test } from "vitest";
import { areDifferentReplayCodes, isSameReplayCode } from "./replay-code";

const CODE = "R6KE-DO64-3CXD-XVKL";

describe("isSameReplayCode", () => {
	test.each([
		{ why: "identical", b: CODE, expected: true },
		{ why: "3 misread glyphs", b: "R6KE-DO64-3CXD-XUUU", expected: true },
		{ why: "4 misread glyphs", b: "R6KE-DO64-3CXD-UUUU", expected: false },
		{ why: "1 glyph short", b: "R6KE-DO64-3CXD-XVK", expected: true },
	])("$why -> $expected", ({ b, expected }) => {
		expect(isSameReplayCode(CODE, b)).toBe(expected);
	});
});

describe("areDifferentReplayCodes", () => {
	test.each([
		{ why: "identical", b: CODE, expected: false },
		{ why: "6 misread glyphs", b: "R6KE-DO64-3CUU-UUUU", expected: false },
		{ why: "7 misread glyphs", b: "R6KE-DO64-3UUU-UUUU", expected: true },
		{ why: "unrelated code", b: "ABCD-EFGH-IJKL-MNOP", expected: true },
	])("$why -> $expected", ({ b, expected }) => {
		expect(areDifferentReplayCodes(CODE, b)).toBe(expected);
	});
});
