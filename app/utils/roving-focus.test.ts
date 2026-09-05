import { describe, expect, test } from "vitest";
import { focusMoveForKey, rovingFocusIndex } from "./roving-focus";

describe("rovingFocusIndex", () => {
	test.each([
		{ why: "first", move: "first", current: 2, wrap: true, expected: 0 },
		{ why: "last", move: "last", current: 0, wrap: true, expected: 4 },
		{ why: "next wraps", move: "next", current: 4, wrap: true, expected: 0 },
		{
			why: "previous wraps",
			move: "previous",
			current: 0,
			wrap: true,
			expected: 4,
		},
		{ why: "next clamps", move: "next", current: 4, wrap: false, expected: 4 },
		{
			why: "previous clamps",
			move: "previous",
			current: 0,
			wrap: false,
			expected: 0,
		},
		{
			why: "next from nothing focused",
			move: "next",
			current: -1,
			wrap: true,
			expected: 0,
		},
		{
			why: "previous from nothing focused lands on the last item",
			move: "previous",
			current: -1,
			wrap: true,
			expected: 4,
		},
		{
			why: "previous from nothing focused, clamped",
			move: "previous",
			current: -1,
			wrap: false,
			expected: 4,
		},
	] as const)("$why", ({ move, current, wrap, expected }) => {
		expect(rovingFocusIndex(move, current, 5, { wrap })).toBe(expected);
	});
});

describe("focusMoveForKey", () => {
	test.each([
		{ key: "ArrowDown", orientation: "vertical", expected: "next" },
		{ key: "ArrowUp", orientation: "vertical", expected: "previous" },
		{ key: "ArrowRight", orientation: "vertical", expected: null },
		{ key: "ArrowRight", orientation: "horizontal", expected: "next" },
		{ key: "ArrowLeft", orientation: "horizontal", expected: "previous" },
		{ key: "ArrowDown", orientation: "horizontal", expected: null },
		{ key: "Home", orientation: "horizontal", expected: "first" },
		{ key: "End", orientation: "vertical", expected: "last" },
		{ key: "Enter", orientation: "vertical", expected: null },
	] as const)(
		"%s in a $orientation group -> $expected",
		({ key, orientation, expected }) => {
			expect(focusMoveForKey(key, orientation)).toBe(expected);
		},
	);
});
