import { describe, expect, test } from "vitest";
import * as ConsoleCapture from "./ConsoleCapture";

describe("ConsoleCapture.formatConsoleArgs", () => {
	test.each([
		{ why: "plain strings", args: ["a", "b"], expected: "a b" },
		{
			why: "%s substitutions",
			args: ["Warning: %s is %s", "key", "missing"],
			expected: "Warning: key is missing",
		},
		{
			why: "%c styles dropped",
			args: ["%cstyled", "color: red"],
			expected: "styled",
		},
		{ why: "escaped percent", args: ["100%%"], expected: "100%" },
		{
			why: "extra args appended",
			args: ["%s!", "hi", { a: 1 }],
			expected: 'hi! {"a":1}',
		},
		{ why: "non-string first arg", args: [1, true], expected: "1 true" },
	])("$why", ({ args, expected }) => {
		expect(ConsoleCapture.formatConsoleArgs(args)).toBe(expected);
	});
});

describe("ConsoleCapture.isHydrationMessage", () => {
	test.each([
		["A tree hydrated but some attributes didn't match", true],
		["Hydration failed because the server rendered HTML", true],
		["Each child in a list should have a unique key", false],
	])("%s", (message, expected) => {
		expect(ConsoleCapture.isHydrationMessage(message)).toBe(expected);
	});
});
