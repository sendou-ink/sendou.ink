import { describe, expect, test } from "vitest";
import {
	assertRoundRobin,
	balanceByes,
	makeGroups,
	makeRoundRobinMatches,
} from "../helpers";
import { ordering } from "../ordering";

describe("Round-robin groups", () => {
	test("should place participants in groups", () => {
		expect(makeGroups([1, 2, 3, 4, 5], 2)).toEqual([
			[1, 2, 3],
			[4, 5],
		]);
		expect(makeGroups([1, 2, 3, 4, 5, 6, 7, 8], 2)).toEqual([
			[1, 2, 3, 4],
			[5, 6, 7, 8],
		]);
		expect(makeGroups([1, 2, 3, 4, 5, 6, 7, 8], 3)).toEqual([
			[1, 2, 3],
			[4, 5, 6],
			[7, 8],
		]);
	});

	test("should make the rounds for a round-robin group", () => {
		assertRoundRobin([1, 2, 3], makeRoundRobinMatches([1, 2, 3]));
		assertRoundRobin([1, 2, 3, 4], makeRoundRobinMatches([1, 2, 3, 4]));
		assertRoundRobin([1, 2, 3, 4, 5], makeRoundRobinMatches([1, 2, 3, 4, 5]));
		assertRoundRobin(
			[1, 2, 3, 4, 5, 6],
			makeRoundRobinMatches([1, 2, 3, 4, 5, 6]),
		);
	});
});

describe("Seed ordering methods", () => {
	test("should place 2 participants with inner-outer method", () => {
		const teams = [1, 2];
		const placement = ordering.inner_outer(teams);
		expect(placement).toEqual([1, 2]);
	});

	test("should place 4 participants with inner-outer method", () => {
		const teams = [1, 2, 3, 4];
		const placement = ordering.inner_outer(teams);
		expect(placement).toEqual([1, 4, 2, 3]);
	});

	test("should place 8 participants with inner-outer method", () => {
		const teams = [1, 2, 3, 4, 5, 6, 7, 8];
		const placement = ordering.inner_outer(teams);
		expect(placement).toEqual([1, 8, 4, 5, 2, 7, 3, 6]);
	});

	test("should place 16 participants with inner-outer method", () => {
		const teams = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16];
		const placement = ordering.inner_outer(teams);
		expect(placement).toEqual([
			1, 16, 8, 9, 4, 13, 5, 12, 2, 15, 7, 10, 3, 14, 6, 11,
		]);
	});

	test("should make a natural ordering", () => {
		expect(ordering.natural([1, 2, 3, 4, 5, 6, 7, 8])).toEqual([
			1, 2, 3, 4, 5, 6, 7, 8,
		]);
	});

	test("should make a reverse ordering", () => {
		expect(ordering.reverse([1, 2, 3, 4, 5, 6, 7, 8])).toEqual([
			8, 7, 6, 5, 4, 3, 2, 1,
		]);
	});

	test("should make a half shift ordering", () => {
		expect(ordering.half_shift([1, 2, 3, 4, 5, 6, 7, 8])).toEqual([
			5, 6, 7, 8, 1, 2, 3, 4,
		]);
	});

	test("should make a reverse half shift ordering", () => {
		expect(ordering.reverse_half_shift([1, 2, 3, 4, 5, 6, 7, 8])).toEqual([
			4, 3, 2, 1, 8, 7, 6, 5,
		]);
	});

	test("should make a pair flip ordering", () => {
		expect(ordering.pair_flip([1, 2, 3, 4, 5, 6, 7, 8])).toEqual([
			2, 1, 4, 3, 6, 5, 8, 7,
		]);
	});

	test("should make an effort balanced ordering for groups", () => {
		expect(
			ordering["groups.effort_balanced"]([1, 2, 3, 4, 5, 6, 7, 8], 4),
		).toEqual([1, 5, 2, 6, 3, 7, 4, 8]);

		expect(
			ordering["groups.effort_balanced"](
				[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16],
				4,
			),
		).toEqual([1, 5, 9, 13, 2, 6, 10, 14, 3, 7, 11, 15, 4, 8, 12, 16]);

		expect(
			ordering["groups.effort_balanced"]([1, 2, 3, 4, 5, 6, 7, 8], 2),
		).toEqual([1, 3, 5, 7, 2, 4, 6, 8]);
	});

	test("should make a snake ordering for groups", () => {
		expect(
			ordering["groups.seed_optimized"]([1, 2, 3, 4, 5, 6, 7, 8], 4),
		).toEqual([1, 8, 2, 7, 3, 6, 4, 5]);

		expect(
			ordering["groups.seed_optimized"](
				[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16],
				4,
			),
		).toEqual([1, 8, 9, 16, 2, 7, 10, 15, 3, 6, 11, 14, 4, 5, 12, 13]);

		expect(
			ordering["groups.seed_optimized"]([1, 2, 3, 4, 5, 6, 7, 8], 2),
		).toEqual([1, 4, 5, 8, 2, 3, 6, 7]);
	});
});

describe("Balance BYEs", () => {
	test("should ignore input BYEs in the seeding", () => {
		expect(
			balanceByes(
				[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, null, null, null, null],
				16,
			),
		).toEqual(balanceByes([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], 16));

		expect(
			balanceByes(
				[1, 2, 3, null, 4, 5, 6, 7, 8, null, 9, 10, null, 11, null, 12, null],
				16,
			),
		).toEqual(balanceByes([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], 16));
	});

	test("should take the target size as an argument or calculate it", () => {
		expect(balanceByes([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], 16)).toEqual(
			balanceByes([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]),
		);
	});

	test("should prefer matches with only one BYE", () => {
		expect(
			balanceByes([
				1,
				2,
				3,
				4,
				5,
				6,
				7,
				8,
				9,
				10,
				11,
				12,
				null,
				null,
				null,
				null,
			]),
		).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, null, 10, null, 11, null, 12, null]);

		expect(
			balanceByes(
				[
					1,
					2,
					3,
					4,
					5,
					6,
					7,
					8,
					null,
					null,
					null,
					null,
					null,
					null,
					null,
					null,
				],
				16,
			),
		).toEqual([
			1,
			null,
			2,
			null,
			3,
			null,
			4,
			null,
			5,
			null,
			6,
			null,
			7,
			null,
			8,
			null,
		]);

		expect(
			balanceByes(
				[
					1,
					2,
					3,
					4,
					5,
					6,
					7,
					null,
					null,
					null,
					null,
					null,
					null,
					null,
					null,
					null,
				],
				16,
			),
		).toEqual([
			1,
			null,
			2,
			null,
			3,
			null,
			4,
			null,
			5,
			null,
			6,
			null,
			7,
			null,
			null,
			null,
		]);
	});
});
