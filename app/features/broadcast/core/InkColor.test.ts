import { describe, expect, test } from "vitest";
import type { BroadcastInkRgb } from "../broadcast-types";
import * as InkColor from "./InkColor";

// game start reads of the HUD's player icons off cast and POV VoDs
describe("InkColor.closestPair", () => {
	test.each([
		{
			why: "Yellow vs Dark Blue",
			inks: [rgb(202, 190, 33), rgb(60, 32, 186)],
			expected: "yellowDarkBlue",
		},
		{
			why: "Yellow vs Purple, of about the same hue",
			inks: [rgb(190, 205, 72), rgb(95, 51, 188)],
			expected: "yellowPurple",
		},
		{
			why: "Color Lock's yellow and purple",
			inks: [rgb(197, 187, 52), rgb(80, 54, 164)],
			expected: "lockYellowPurple",
		},
		{
			why: "Orange vs Dark Blue",
			inks: [rgb(210, 108, 52), rgb(59, 65, 180)],
			expected: "orangeDarkBlue",
		},
		{
			why: "Dark Blue vs Orange",
			inks: [rgb(216, 144, 53), rgb(37, 37, 172)],
			expected: "darkBlueOrange",
		},
		{
			why: "Color Lock's orange and blue",
			inks: [rgb(213, 150, 43), rgb(41, 89, 179)],
			expected: "lockOrangeBlue",
		},
		{
			why: "reads in the other order",
			inks: [rgb(31, 32, 172), rgb(216, 141, 48)],
			expected: "darkBlueOrange",
		},
		{
			why: "the sky behind splatted icons read as a team's ink",
			inks: [rgb(208, 193, 24), rgb(69, 91, 147)],
			expected: null,
		},
		{
			why: "Color Lock's yellow and purple read about as close to Yellow vs Dark Blue",
			inks: [rgb(188, 189, 45), rgb(72, 41, 165)],
			expected: null,
		},
	] as const)("$why", ({ inks, expected }) => {
		expect(InkColor.closestPair([...inks], null)).toBe(expected);
	});

	test.each([
		{
			why: "keeps Color Lock on from the game before",
			inks: [rgb(188, 189, 45), rgb(72, 41, 165)],
			previous: "lockYellowPurple",
			expected: "lockYellowPurple",
		},
		{
			why: "leaves Color Lock out after a game without it",
			inks: [rgb(188, 189, 45), rgb(72, 41, 165)],
			previous: "greenPink",
			expected: "yellowDarkBlue",
		},
		{
			why: "leaves Color Lock once the ink is far off it",
			inks: [rgb(164, 201, 61), rgb(171, 53, 162)],
			previous: "lockYellowPurple",
			expected: "greenPink",
		},
	] as const)("$why", ({ inks, previous, expected }) => {
		expect(InkColor.closestPair([...inks], previous)).toBe(expected);
	});
});

describe("InkColor.isInPairOrder", () => {
	test.each([
		{
			why: "first read is the pair's first color",
			inks: [rgb(202, 190, 33), rgb(60, 32, 186)],
			expected: true,
		},
		{
			why: "first read is the pair's second color",
			inks: [rgb(60, 32, 186), rgb(202, 190, 33)],
			expected: false,
		},
		{
			why: "only the second read, the pair's first color",
			inks: [null, rgb(202, 190, 33)],
			expected: false,
		},
		{ why: "neither read", inks: [null, null], expected: null },
	] as const)("$why", ({ inks, expected }) => {
		expect(InkColor.isInPairOrder([...inks], "yellowDarkBlue")).toBe(expected);
	});
});

function rgb(r: number, g: number, b: number): BroadcastInkRgb {
	return { r, g, b };
}
