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
