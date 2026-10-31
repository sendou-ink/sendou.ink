import { describe, expect, test } from "vitest";
import { diff } from "./arrays";

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
