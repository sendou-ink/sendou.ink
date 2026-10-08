import { describe, expect, test } from "vitest";
import * as CoachPlayback from "../../core/CoachPlayback";

const STARTS = [100, 40, 10];
const identity = (start: number) => start;

describe("CoachPlayback.step", () => {
	test.each([
		{ why: "next start ahead", t: 20, direction: "next", expected: 40 },
		{ why: "skips the start playing", t: 40, direction: "next", expected: 100 },
		{
			why: "nothing after the last",
			t: 120,
			direction: "next",
			expected: undefined,
		},
		{
			why: "restarts the one playing",
			t: 60,
			direction: "previous",
			expected: 40,
		},
		{
			why: "the one before right after a start",
			t: 41,
			direction: "previous",
			expected: 10,
		},
		{
			why: "nothing before the first",
			t: 12,
			direction: "previous",
			expected: undefined,
		},
		{
			why: "back from a gap restarts the last",
			t: 300,
			direction: "previous",
			expected: 100,
		},
	] as const)("$why", ({ t, direction, expected }) => {
		expect(CoachPlayback.step(STARTS, identity, t, direction)).toBe(expected);
	});

	test("of items starting together picks the first listed", () => {
		const first = { start: 50 };
		const second = { start: 50 };

		expect(
			CoachPlayback.step([first, second], (item) => item.start, 0, "next"),
		).toBe(first);
	});
});

describe("CoachPlayback.speedStep", () => {
	test.each([
		{ why: "faster", current: 1, direction: "next", expected: 1.5 },
		{ why: "slower", current: 1, direction: "previous", expected: 0.5 },
		{ why: "fastest stays", current: 2, direction: "next", expected: 2 },
		{
			why: "slowest stays",
			current: 0.25,
			direction: "previous",
			expected: 0.25,
		},
		{
			why: "off the list, faster",
			current: 1.25,
			direction: "next",
			expected: 1.5,
		},
		{
			why: "off the list, slower",
			current: 1.25,
			direction: "previous",
			expected: 1,
		},
		{
			why: "beyond the fastest",
			current: 3,
			direction: "previous",
			expected: 2,
		},
	] as const)("$why", ({ current, direction, expected }) => {
		expect(CoachPlayback.speedStep(current, direction)).toBe(expected);
	});
});
