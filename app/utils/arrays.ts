// TODO: when more examples of permissions profile difference between
// this implementation and one that takes arrays

import clone from "just-clone";
import shuffle from "just-shuffle";
import invariant from "~/utils/invariant";

// (not all arrays need to necessarily run but they need to be defined)
export function allTruthy(arr: unknown[]) {
	return arr.every(Boolean);
}

/** Mimics Array.prototype.at except throws an error if index out of bounds */
export function atOrError<T>(arr: T[], n: number) {
	const result = at(arr, n);
	if (result === undefined) {
		throw new Error(`Index ${n} out of bounds. Array length is ${arr.length}`);
	}
	return result;
}

// https://github.com/tc39/proposal-relative-indexing-method#polyfill
/** Array.at polyfill */
function at<T>(arr: T[], n: number) {
	// ToInteger() abstract op
	// biome-ignore lint/style/noParameterAssign : biome migration
	n = Math.trunc(n) || 0;
	// Allow negative indexing from the end
	// biome-ignore lint/style/noParameterAssign: biome migration
	if (n < 0) n += arr.length;
	// OOB access is guaranteed to return undefined
	if (n < 0 || n >= arr.length) return undefined;
	// Otherwise, this is just normal property access
	return arr[n];
}

// TODO: i18n (at least for SendouQ)
export function joinListToNaturalString(arg: string[], lastSeparator = "and") {
	if (arg.length === 1) return arg[0];

	const list = [...arg];
	const last = list.pop();
	const commaJoined = list.join(", ");

	return last ? `${commaJoined} ${lastSeparator} ${last}` : commaJoined;
}

export function normalizeFormFieldArray(
	value: undefined | null | string | string[],
): string[] {
	return value == null ? [] : typeof value === "string" ? [value] : value;
}

/** Can be used as a strongly typed array filter */
export function isDefined<T>(value: T | undefined | null): value is T {
	return value !== null && value !== undefined;
}

export function removeDuplicates<T>(arr: T[]): T[] {
	const seen = new Set<T>();

	return arr.filter((item) => {
		if (seen.has(item)) return false;
		seen.add(item);

		return true;
	});
}

export function removeDuplicatesByProperty<T>(
	arr: T[],
	getter: (arg0: T) => number | string,
): T[] {
	const seen = new Set();
	return arr.filter((item) => {
		const id = getter(item);

		if (seen.has(id)) return false;
		seen.add(id);

		return true;
	});
}

export function nullFilledArray(size: number): null[] {
	return new Array(size).fill(null);
}

export function pickRandomItem<T>(array: T[]): T {
	invariant(array.length > 0, "Can't pick from empty array");

	const shuffled = shuffle(clone(array));

	return shuffled[0];
}

export function filterOutFalsy<T>(arr: (T | null | undefined)[]): T[] {
	return arr.filter(Boolean) as T[];
}

/**
 * Calculates the average of an array of numbers. If the array is empty, returns null.
 *
 * @param values - An array of numbers to calculate the average of.
 * @returns The average of the numbers in the array, or null if the array is empty.
 */
export function nullifyingAvg(values: number[]) {
	if (values.length === 0) return null;
	return values.reduce((acc, cur) => acc + cur, 0) / values.length;
}
