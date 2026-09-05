// TODO: when more examples of permissions profile difference between
// this implementation and one that takes arrays

// (not all arrays need to necessarily run but they need to be defined)
export function allTruthy(arr: unknown[]) {
	return arr.every(Boolean);
}

export function normalizeFormFieldArray(
	value: undefined | null | string | string[],
): string[] {
	return value == null ? [] : typeof value === "string" ? [value] : value;
}

export function nullFilledArray(size: number): null[] {
	return new Array(size).fill(null);
}

/** Average of the numbers, null for an empty array. */
export function nullifyingAvg(values: number[]) {
	if (values.length === 0) return null;
	return values.reduce((acc, cur) => acc + cur, 0) / values.length;
}

function countElements<T>(arr: T[]): Map<T, number> {
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
		for (let i = 0; i < count; i++) {
			result.push(element);
		}
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

/** Alternates elements of both arrays, then appends the longer array's rest: `flatZip([1, 2, 3], ['a']) → [1, 'a', 2, 3]`. */
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
