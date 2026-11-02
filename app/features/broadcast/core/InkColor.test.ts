import { describe, expect, test } from "vitest";
import * as InkColor from "./InkColor";

// hues as the player status strip reads them off the scanner's fixtures
describe("InkColor.closestPair", () => {
	test.each([
		{ why: "lime and pink", hues: [76, 304], expected: "greenPink" },
		{ why: "reads in the other order", hues: [303, 82], expected: "greenPink" },
		{ why: "purple and orange", hues: [274, 18], expected: "orangePurple" },
		{
			why: "turquoise and orange",
			hues: [8, 174],
			expected: "turquoiseOrange",
		},
		{
			why: "Turf War's yellow and purple",
			hues: [65, 261],
			expected: "yellowPurple",
		},
		{ why: "a pair not known", hues: [120, 200], expected: null },
	] as const)("$why", ({ hues, expected }) => {
		expect(InkColor.closestPair([...hues])).toBe(expected);
	});
});
