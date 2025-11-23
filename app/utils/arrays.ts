// TODO: when more examples of permissions profile difference between
// this implementation and one that takes arrays

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

export function normalizeFormFieldArray(
	value: undefined | null | string | string[],
): string[] {
	return value == null ? [] : typeof value === "string" ? [value] : value;
}

export function nullFilledArray(size: number): null[] {
	return new Array(size).fill(null);
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

export function countElements<T>(arr: T[]): Map<T, number> {
	const counts = new Map<T, number>();

	for (const element of arr) {
		const count = counts.get(element) ?? 0;
		counts.set(element, count + 1);
	}

	return counts;
}

/** Returns list of elements that are in arr2 but not in arr1. Supports duplicates */
export function diff<T extends string | number>(arr1: T[], arr2: T[]): T[] {
	const arr1Counts = countElements(arr1);
	const arr2Counts = countElements(arr2);

	const diff = new Map<T, number>();

	for (const [element, count] of arr2Counts) {
		const diffCount = Math.max(count - (arr1Counts.get(element) ?? 0), 0);
		diff.set(element, diffCount);
	}

	const result: T[] = [];

	for (const [element, count] of diff) {
		result.push(...new Array(count).fill(element));
	}

	return result;
}

export function mostPopularArrayElement<T>(arr: T[]): T | null {
	if (arr.length === 0) return null;

	const counts = countElements(arr);
	let mostPopularElement: T | null = null;
	let maxCount = 0;

	for (const [element, count] of counts) {
		if (count > maxCount) {
			maxCount = count;
			mostPopularElement = element;
		}
	}

	return mostPopularElement;
}

/**
 * Safely zips two arrays together by alternating elements. If arrays have different lengths,
 * zips as much as possible, then appends remaining elements from the longer array.
 *
 * @param arr1 - The first array
 * @param arr2 - The second array
 * @returns Alternating elements from both arrays: [arr1[0], arr2[0], arr1[1], arr2[1], ...]
 *          followed by any remaining elements from the longer array
 *
 * @example
 * zipSafe([1, 2], ['a', 'b']) // [1, 'a', 2, 'b']
 * zipSafe([1, 2], ['a', 'b', 'c']) // [1, 'a', 2, 'b', 'c']
 * zipSafe([1, 2, 3], ['a', 'b']) // [1, 'a', 2, 'b', 3]
 */
export function flatZip<T, U>(arr1: T[], arr2: U[]): Array<T | U> {
	const result: Array<T | U> = [];
	const minLength = Math.min(arr1.length, arr2.length);

	for (let i = 0; i < minLength; i++) {
		result.push(arr1[i], arr2[i]);
	}

	if (arr1.length > minLength) {
		result.push(...arr1.slice(minLength));
	} else if (arr2.length > minLength) {
		result.push(...arr2.slice(minLength));
	}

	return result;
}
