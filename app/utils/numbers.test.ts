import { describe, expect, test } from "vitest";
import {
	averageArray,
	cutToNDecimalPlaces,
	roundToNDecimalPlaces,
	safeNumberParse,
} from "./number";

describe("roundToNDecimalPlaces()", () => {
	test.each([
		[1.234, 1.23],
		[1.235, 1.24],
		[1.2, 1.2],
		[1, 1],
	])("rounds %d to %d with the default 2 decimal places", (input, expected) => {
		expect(roundToNDecimalPlaces(input)).toBe(expected);
	});

	test.each([
		[1.6, 0, 2],
		[1.4, 0, 1],
		[2.5, 0, 3],
		[1.23456, 3, 1.235],
		[1.23444, 3, 1.234],
		[-1.2345, 2, -1.23],
		[-1.2355, 2, -1.24],
		[0, 2, 0],
		[0, 0, 0],
		[123456.789, 1, 123456.8],
		[123456.789, 0, 123457],
	])("rounds %d to %d decimal places as %d", (input, decimals, expected) => {
		expect(roundToNDecimalPlaces(input, decimals)).toBe(expected);
	});
});

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

describe("averageArray()", () => {
	test.each([
		[[2, 4, 6, 8], 5],
		[[-2, -4, -6, -8], -5],
		[[10, -10, 20, -20], 0],
		[[42], 42],
		[[], 0],
	])("averages %j to %d", (input, expected) => {
		expect(averageArray(input)).toBe(expected);
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
