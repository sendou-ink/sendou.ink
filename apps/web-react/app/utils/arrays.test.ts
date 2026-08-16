import { describe, expect, test } from "vitest";
import { diff, flatZip, mostPopularArrayElement } from "./arrays";

describe("diff", () => {
	test.each([
		[
			[1, 2, 3],
			[2, 3, 4, 4],
			[4, 4],
		],
		[[1, 2, 3], [], []],
		[[], [1, 2, 3], [1, 2, 3]],
		[
			[1, 2, 2, 3],
			[2, 2, 3, 3, 4],
			[3, 4],
		],
		[[1, 2, 3], [1, 2, 3], []],
	])("%j vs %j leaves %j", (arr1, arr2, expected) => {
		expect(diff(arr1, arr2)).toEqual(expected);
	});

	test("does not overflow the stack for very large counts", () => {
		const arr2 = new Array(200_000).fill(1);

		expect(diff([], arr2)).toHaveLength(200_000);
	});
});

describe("mostPopularArrayElement", () => {
	test.each([
		[[1, 2, 2, 3, 3, 3, 4], 3],
		[["a", "b", "b", "c", "a", "b"], "b"],
		// the first of the tied elements wins
		[[1, 2, 2, 1], 1],
		[["only"], "only"],
		[[], null],
	] as [(string | number)[], string | number | null][])(
		"%j is most popularly %j",
		(arr, expected) => {
			expect(mostPopularArrayElement(arr)).toBe(expected);
		},
	);
});

describe("flatZip", () => {
	test.each([
		[
			[1, 2, 3],
			["a", "b", "c"],
			[1, "a", 2, "b", 3, "c"],
		],
		[
			[1, 2],
			["a", "b", "c"],
			[1, "a", 2, "b", "c"],
		],
		[
			[1, 2, 3, 4],
			["a", "b"],
			[1, "a", 2, "b", 3, 4],
		],
		[[], ["a", "b"], ["a", "b"]],
		[[1, 2], [], [1, 2]],
		[[], [], []],
		[[1], ["a"], [1, "a"]],
	])("zips %j and %j into %j", (arr1, arr2, expected) => {
		expect(flatZip(arr1, arr2)).toEqual(expected);
	});
});
