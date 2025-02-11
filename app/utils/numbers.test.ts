import { describe, expect, test } from "vitest";
import { cutToNDecimalPlaces } from "./number";

describe("cutToNDecimalPlaces()", () => {
	test("cutOff truncates decimal places correctly", () => {
		const result = cutToNDecimalPlaces(3.9999, 2);
		expect(result).toBe(3.99);
	});

	test("cutOff can change amount of decimals returned", () => {
		const result = cutToNDecimalPlaces(3.12, 1);
		expect(result).toBe(3.1);
	});

	test("cutOff preserves decimal values with the desired number of decimal places correctly", () => {
		const result = cutToNDecimalPlaces(100, 2);
		expect(result).toBe(100);
	});

	test("cutOff cuts off decimal places and removes trailing zeros correctly", () => {
		const result = cutToNDecimalPlaces(3.0001, 2);
		expect(result).toBe(3);
	});
});
