import { describe, expect, test } from "vitest";
import * as TierLabel from "./TierLabel";

describe("TierLabel.fontSize", () => {
	test.each([
		{ name: "X", expected: "var(--font-xl)" },
		{ name: "Good", expected: "var(--font-lg)" },
		{ name: "Pretty decent", expected: "var(--font-md)" },
		{ name: "Only on certain stages", expected: "var(--font-sm)" },
		{ name: "Fine if your team plays around it", expected: "var(--font-xs)" },
		{
			name: "Never pick this one under any circumstances",
			expected: "var(--font-2xs)",
		},
	])("$name -> $expected", ({ name, expected }) => {
		expect(TierLabel.fontSize(name)).toBe(expected);
	});
});

describe("TierLabel.isLightColor", () => {
	test.each([
		{ hex: "#ffd23f", expected: true, why: "bright yellow" },
		{ hex: "#ffffff", expected: true, why: "white" },
		{ hex: "#90ee90", expected: true, why: "light green" },
		{ hex: "#8b0000", expected: false, why: "dark red" },
		{ hex: "#4169e1", expected: false, why: "royal blue" },
		{ hex: "#000000", expected: false, why: "black" },
		{ hex: "#fff", expected: true, why: "short form white" },
		{ hex: "#000", expected: false, why: "short form black" },
		{ hex: "#ffd", expected: true, why: "short form light yellow" },
		{ hex: "not-a-color", expected: false, why: "garbage" },
	])("$why -> $expected", ({ hex, expected }) => {
		expect(TierLabel.isLightColor(hex)).toBe(expected);
	});
});

describe("TierLabel.textColor", () => {
	test.each([
		{ hex: "#ffd23f", expected: "var(--color-text-on-light)", why: "light" },
		{ hex: "#4169e1", expected: "var(--color-text-on-dark)", why: "dark" },
	])("$why background -> $expected", ({ hex, expected }) => {
		expect(TierLabel.textColor(hex)).toBe(expected);
	});
});
