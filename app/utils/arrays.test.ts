import { describe, expect, it } from "vitest";
import { diff, flatZip, mostPopularArrayElement } from "./arrays";

describe("diff", () => {
	it("should return elements in arr2 but not in arr1", () => {
		const arr1 = [1, 2, 3];
		const arr2 = [2, 3, 4, 4];
		const result = diff(arr1, arr2);
		expect(result).toEqual([4, 4]);
	});

	it("should return an empty array if arr2 is empty", () => {
		const arr1 = [1, 2, 3];
		const arr2: number[] = [];
		const result = diff(arr1, arr2);
		expect(result).toEqual([]);
	});

	it("should return all elements of arr2 if arr1 is empty", () => {
		const arr1: number[] = [];
		const arr2 = [1, 2, 3];
		const result = diff(arr1, arr2);
		expect(result).toEqual([1, 2, 3]);
	});

	it("should handle arrays with duplicate elements", () => {
		const arr1 = [1, 2, 2, 3];
		const arr2 = [2, 2, 3, 3, 4];
		const result = diff(arr1, arr2);
		expect(result).toEqual([3, 4]);
	});

	it("should return an empty array if both arrays are the same", () => {
		const arr1 = [1, 2, 3];
		const arr2 = [1, 2, 3];
		const result = diff(arr1, arr2);
		expect(result).toEqual([]);
	});
});

describe("mostPopularArrayElement", () => {
	it("should return the most frequent element in an array of numbers", () => {
		const arr = [1, 2, 2, 3, 3, 3, 4];
		const result = mostPopularArrayElement(arr);
		expect(result).toBe(3);
	});

	it("should return the most frequent element in an array of strings", () => {
		const arr = ["a", "b", "b", "c", "a", "b"];
		const result = mostPopularArrayElement(arr);
		expect(result).toBe("b");
	});

	it("should return the first most frequent element if there is a tie", () => {
		const arr = [1, 2, 2, 1];
		const result = mostPopularArrayElement(arr);
		expect(result).toBe(1);
	});

	it("should return null for an empty array", () => {
		const arr: number[] = [];
		const result = mostPopularArrayElement(arr);
		expect(result).toBeNull();
	});

	it("should return the element itself for a single-element array", () => {
		const arr = ["only"];
		const result = mostPopularArrayElement(arr);
		expect(result).toBe("only");
	});
});

describe("flatZip", () => {
	it("should zip arrays of equal length by alternating elements", () => {
		const arr1 = [1, 2, 3];
		const arr2 = ["a", "b", "c"];
		const result = flatZip(arr1, arr2);
		expect(result).toEqual([1, "a", 2, "b", 3, "c"]);
	});

	it("should zip and append remaining elements when second array is longer", () => {
		const arr1 = [1, 2];
		const arr2 = ["a", "b", "c"];
		const result = flatZip(arr1, arr2);
		expect(result).toEqual([1, "a", 2, "b", "c"]);
	});

	it("should zip and append remaining elements when first array is longer", () => {
		const arr1 = [1, 2, 3, 4];
		const arr2 = ["a", "b"];
		const result = flatZip(arr1, arr2);
		expect(result).toEqual([1, "a", 2, "b", 3, 4]);
	});

	it("should handle empty first array", () => {
		const arr1: number[] = [];
		const arr2 = ["a", "b"];
		const result = flatZip(arr1, arr2);
		expect(result).toEqual(["a", "b"]);
	});

	it("should handle empty second array", () => {
		const arr1 = [1, 2];
		const arr2: string[] = [];
		const result = flatZip(arr1, arr2);
		expect(result).toEqual([1, 2]);
	});

	it("should handle both empty arrays", () => {
		const arr1: number[] = [];
		const arr2: string[] = [];
		const result = flatZip(arr1, arr2);
		expect(result).toEqual([]);
	});

	it("should handle single element arrays", () => {
		const arr1 = [1];
		const arr2 = ["a"];
		const result = flatZip(arr1, arr2);
		expect(result).toEqual([1, "a"]);
	});
});
