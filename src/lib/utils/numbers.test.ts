import { describe, expect, it, test } from 'vitest';
import {
	averageArray,
	cutToNDecimalPlaces,
	roundToNDecimalPlaces,
	safeNumberParse
} from './number';

describe('roundToNDecimalPlaces()', () => {
	it('rounds to 2 decimal places by default', () => {
		expect(roundToNDecimalPlaces(1.234)).toBe(1.23);
		expect(roundToNDecimalPlaces(1.235)).toBe(1.24);
		expect(roundToNDecimalPlaces(1.2)).toBe(1.2);
		expect(roundToNDecimalPlaces(1)).toBe(1);
	});

	it('rounds to 0 decimal places', () => {
		expect(roundToNDecimalPlaces(1.6, 0)).toBe(2);
		expect(roundToNDecimalPlaces(1.4, 0)).toBe(1);
		expect(roundToNDecimalPlaces(2.5, 0)).toBe(3);
	});

	it('rounds to 3 decimal places', () => {
		expect(roundToNDecimalPlaces(1.23456, 3)).toBe(1.235);
		expect(roundToNDecimalPlaces(1.23444, 3)).toBe(1.234);
	});

	it('handles negative numbers', () => {
		expect(roundToNDecimalPlaces(-1.2345, 2)).toBe(-1.23);
		expect(roundToNDecimalPlaces(-1.2355, 2)).toBe(-1.24);
	});

	it('handles zero', () => {
		expect(roundToNDecimalPlaces(0, 2)).toBe(0);
		expect(roundToNDecimalPlaces(0, 0)).toBe(0);
	});

	it('handles large numbers', () => {
		expect(roundToNDecimalPlaces(123456.789, 1)).toBe(123456.8);
		expect(roundToNDecimalPlaces(123456.789, 0)).toBe(123457);
	});
});

describe('cutToNDecimalPlaces()', () => {
	test('cutOff truncates decimal places correctly', () => {
		const result = cutToNDecimalPlaces(3.9999, 2);
		expect(result).toBe(3.99);
	});

	test('cutOff can change amount of decimals returned', () => {
		const result = cutToNDecimalPlaces(3.12, 1);
		expect(result).toBe(3.1);
	});

	test('cutOff preserves decimal values with the desired number of decimal places correctly', () => {
		const result = cutToNDecimalPlaces(100, 2);
		expect(result).toBe(100);
	});

	test('cutOff cuts off decimal places and removes trailing zeros correctly', () => {
		const result = cutToNDecimalPlaces(3.0001, 2);
		expect(result).toBe(3);
	});
});

describe('averageArray()', () => {
	it('returns the average of positive numbers', () => {
		const result = averageArray([2, 4, 6, 8]);
		expect(result).toBe(5);
	});

	it('returns the average of negative numbers', () => {
		const result = averageArray([-2, -4, -6, -8]);
		expect(result).toBe(-5);
	});

	it('returns the average of mixed positive and negative numbers', () => {
		const result = averageArray([10, -10, 20, -20]);
		expect(result).toBe(0);
	});

	it('returns the value itself for a single-element array', () => {
		const result = averageArray([42]);
		expect(result).toBe(42);
	});

	it('returns 0 for an empty array', () => {
		const result = averageArray([]);
		expect(result).toBe(0);
	});
});

describe('safeNumberParse()', () => {
	it('returns null for null input', () => {
		expect(safeNumberParse(null)).toBeNull();
	});

	it('parses valid integer string', () => {
		expect(safeNumberParse('42')).toBe(42);
	});

	it('parses valid float string', () => {
		expect(safeNumberParse('3.14')).toBe(3.14);
	});

	it('returns null for non-numeric string', () => {
		expect(safeNumberParse('abc')).toBeNull();
	});

	it('returns null for empty string', () => {
		expect(safeNumberParse('')).toBeNull();
	});

	it('parses string with leading/trailing spaces', () => {
		expect(safeNumberParse('  7 ')).toBe(7);
	});

	it('parses negative numbers', () => {
		expect(safeNumberParse('-123')).toBe(-123);
	});

	it('parses zero', () => {
		expect(safeNumberParse('0')).toBe(0);
	});

	it('returns null for string with only spaces', () => {
		expect(safeNumberParse('   ')).toBeNull();
	});
});
