import * as R from "remeda";

/**
 * Rounds a number to a specified number of decimal places.
 *
 * @example
 * ```typescript
 * roundToNDecimalPlaces(3.14159); // returns 3.14
 * roundToNDecimalPlaces(3.14159, 3); // returns 3.142
 * roundToNDecimalPlaces(2.5, 0); // returns 3
 * ```
 */
export function roundToNDecimalPlaces(num: number, n = 2) {
	return Number((Math.round(num * 10 ** n) / 10 ** n).toFixed(n));
}

/**
 * Truncates a number to a specified number of decimal places without rounding.
 *
 * @example
 * ```typescript
 * cutToNDecimalPlaces(3.9999, 2); // returns 3.99
 * cutToNDecimalPlaces(3.12, 1); // returns 3.1
 * cutToNDecimalPlaces(100, 2); // returns 100
 * cutToNDecimalPlaces(3.0001, 2); // returns 3
 * ```
 */
export function cutToNDecimalPlaces(num: number, n = 2) {
	const multiplier = 10 ** n;
	const truncatedNum = Math.trunc(num * multiplier) / multiplier;
	const result = truncatedNum.toFixed(n);
	return Number(n > 0 ? result.replace(/\.?0+$/, "") : result);
}

/**
 * Calculates the average (arithmetic mean) of an array of numbers.
 * Returns 0 if the array is empty.
 *
 * @example
 * ```typescript
 * averageArray([2, 4, 6, 8]); // returns 5
 * averageArray([-2, -4, -6, -8]); // returns -5
 * averageArray([10, -10, 20, -20]); // returns 0
 * averageArray([42]); // returns 42
 * averageArray([]); // returns 0
 * ```
 */
export function averageArray(arr: number[]) {
	if (arr.length === 0) return 0;

	return R.sum(arr) / arr.length;
}

/**
 * Safely parses a string into a number, returning `null` if the input is `null`,
 * empty, or not a valid number.
 *
 * Trims whitespace from the input before parsing. If the trimmed string is empty
 * or cannot be converted to a valid number, returns `null`.
 *
 * @example
 * ```typescript
 * safeNumberParse("42"); // returns 42
 * safeNumberParse("  3.14 "); // returns 3.14
 * safeNumberParse(""); // returns null
 * safeNumberParse("abc"); // returns null
 * safeNumberParse(null); // returns null
 * ```
 */
export function safeNumberParse(value: string | null) {
	if (value === null) return null;

	const trimmed = value.trim();
	if (trimmed === "") return null;

	const result = Number(trimmed);
	return Number.isNaN(result) ? null : result;
}
