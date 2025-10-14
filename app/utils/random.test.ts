import { describe, expect, it } from "vitest";
import { seededRandom } from "./random";

describe("seededRandom", () => {
	describe("random", () => {
		it("produces same values for same seed", () => {
			const rng1 = seededRandom("test-seed");
			const rng2 = seededRandom("test-seed");

			expect(rng1.random()).toBe(rng2.random());
			expect(rng1.random()).toBe(rng2.random());
			expect(rng1.random()).toBe(rng2.random());
		});

		it("produces different values for different seeds", () => {
			const rng1 = seededRandom("seed-1");
			const rng2 = seededRandom("seed-2");

			expect(rng1.random()).not.toBe(rng2.random());
		});

		it("returns values between 0 and 1 by default", () => {
			const rng = seededRandom("test");
			for (let i = 0; i < 100; i++) {
				const value = rng.random();
				expect(value).toBeGreaterThanOrEqual(0);
				expect(value).toBeLessThan(1);
			}
		});

		it("returns values between lo and hi when both provided", () => {
			const rng = seededRandom("test");
			for (let i = 0; i < 100; i++) {
				const value = rng.random(5, 10);
				expect(value).toBeGreaterThanOrEqual(5);
				expect(value).toBeLessThan(10);
			}
		});

		it("returns values between 0 and hi when only hi provided", () => {
			const rng = seededRandom("test");
			for (let i = 0; i < 100; i++) {
				const value = rng.random(5);
				expect(value).toBeGreaterThanOrEqual(0);
				expect(value).toBeLessThan(5);
			}
		});
	});

	describe("randomInteger", () => {
		it("produces same values for same seed", () => {
			const rng1 = seededRandom("test-seed");
			const rng2 = seededRandom("test-seed");

			expect(rng1.randomInteger(10)).toBe(rng2.randomInteger(10));
			expect(rng1.randomInteger(10)).toBe(rng2.randomInteger(10));
			expect(rng1.randomInteger(10)).toBe(rng2.randomInteger(10));
		});

		it("produces different values for different seeds", () => {
			const rng1 = seededRandom("seed-1");
			const rng2 = seededRandom("seed-2");

			expect(rng1.randomInteger(100)).not.toBe(rng2.randomInteger(100));
		});

		it("returns integers between 0 and hi when only hi provided", () => {
			const rng = seededRandom("test");
			for (let i = 0; i < 100; i++) {
				const value = rng.randomInteger(10);
				expect(Number.isInteger(value)).toBe(true);
				expect(value).toBeGreaterThanOrEqual(0);
				expect(value).toBeLessThan(10);
			}
		});

		it("returns integers between lo and hi when both provided", () => {
			const rng = seededRandom("test");
			for (let i = 0; i < 100; i++) {
				const value = rng.randomInteger(5, 10);
				expect(Number.isInteger(value)).toBe(true);
				expect(value).toBeGreaterThanOrEqual(5);
				expect(value).toBeLessThan(10);
			}
		});
	});

	describe("seededShuffle", () => {
		it("produces same shuffle for same seed", () => {
			const array = [1, 2, 3, 4, 5];
			const rng1 = seededRandom("test-seed");
			const rng2 = seededRandom("test-seed");

			expect(rng1.seededShuffle(array)).toEqual(rng2.seededShuffle(array));
		});

		it("produces different shuffles for different seeds", () => {
			const array = [1, 2, 3, 4, 5];
			const rng1 = seededRandom("seed-1");
			const rng2 = seededRandom("seed-2");

			expect(rng1.seededShuffle(array)).not.toEqual(rng2.seededShuffle(array));
		});

		it("does not mutate original array", () => {
			const array = [1, 2, 3, 4, 5];
			const original = [...array];
			const rng = seededRandom("test");

			rng.seededShuffle(array);

			expect(array).toEqual(original);
		});

		it("returns array with same elements", () => {
			const array = [1, 2, 3, 4, 5];
			const rng = seededRandom("test");

			const shuffled = rng.seededShuffle(array);

			expect(shuffled.sort()).toEqual(array.sort());
		});

		it("handles empty array", () => {
			const array: number[] = [];
			const rng = seededRandom("test");

			const shuffled = rng.seededShuffle(array);

			expect(shuffled).toEqual([]);
		});

		it("handles single element array", () => {
			const array = [1];
			const rng = seededRandom("test");

			const shuffled = rng.seededShuffle(array);

			expect(shuffled).toEqual([1]);
		});
	});
});
