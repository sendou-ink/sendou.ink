import { describe, expect, test } from "vitest";
import {
	cutToNDecimalPlaces,
	median,
	niceStep,
	safeNumberParse,
	winPercentage,
} from "./number";

describe("cutToNDecimalPlaces()", () => {
	test.each([
		[3.9999, 2, 3.99],
		[3.12, 1, 3.1],
		[100, 2, 100],
		[3.0001, 2, 3],
		[0.29, 2, 0.29],
		// values whose binary representation is just below the decimal shown
		[2.32, 2, 2.32],
		[-0.29, 2, -0.29],
	])("cuts %d to %d decimal places as %d", (input, decimals, expected) => {
		expect(cutToNDecimalPlaces(input, decimals)).toBe(expected);
	});
});

describe("safeNumberParse()", () => {
	test.each([
		["42", 42],
		["3.14", 3.14],
		["  7 ", 7],
		["-123", -123],
		["0", 0],
		["abc", null],
		["", null],
		["   ", null],
		[null, null],
	])("parses %j as %j", (input, expected) => {
		expect(safeNumberParse(input)).toBe(expected);
	});
});

describe("winPercentage()", () => {
	test.each([
		[3, 1, 75],
		[1, 1, 50],
		[0, 4, 0],
		[4, 0, 100],
	])("%d wins and %d losses is %d%%", (wins, losses, expected) => {
		expect(winPercentage(wins, losses)).toBe(expected);
	});

	test("returns null when no games were played", () => {
		expect(winPercentage(0, 0)).toBeNull();
	});
});

describe("niceStep()", () => {
	test.each([
		{ why: "exact power of ten", roughStep: 10, expected: 10 },
		{ why: "rounds up to 2×", roughStep: 13, expected: 20 },
		{ why: "rounds up to 5×", roughStep: 42, expected: 50 },
		{ why: "rounds up to the next power of ten", roughStep: 70, expected: 100 },
		{ why: "fractional step", roughStep: 0.3, expected: 0.5 },
	])("$why: $roughStep → $expected", ({ roughStep, expected }) => {
		expect(niceStep(roughStep)).toBeCloseTo(expected);
	});
});

describe("median()", () => {
	test.each([
		{ why: "an odd count", values: [5, 1, 3], expected: 3 },
		{ why: "an even count", values: [4, 1, 3, 2], expected: 2.5 },
		{ why: "one value", values: [7], expected: 7 },
		{ why: "no values", values: [], expected: 0 },
		{ why: "values sorted as numbers", values: [10, 9, 100], expected: 10 },
	])("takes the middle of $why", ({ values, expected }) => {
		expect(median(values)).toBe(expected);
	});

	test("leaves its input in place", () => {
		const values = [3, 1, 2];
		median(values);
		expect(values).toEqual([3, 1, 2]);
	});
});
