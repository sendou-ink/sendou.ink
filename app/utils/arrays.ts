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

	const counts = new Map<T, number>();

	for (const [element, count] of arr2Counts) {
		const diffCount = Math.max(count - (arr1Counts.get(element) ?? 0), 0);
		counts.set(element, diffCount);
	}

	const result: T[] = [];

	for (const [element, count] of counts) {
		for (let i = 0; i < count; i++) {
			result.push(element);
		}
	}

	return result;
}
