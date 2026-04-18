import { describe, expect, test } from "vitest";
import {
	assertAbDivisionRoundRobin,
	assertRoundRobin,
	balanceByes,
	makeAbDivisionGroups,
	makeAbDivisionRoundRobinMatches,
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

describe("A/B divisions round-robin groups", () => {
	test("should pair every A with every B exactly once for N=2..6", () => {
		for (const n of [2, 3, 4, 5, 6]) {
			const divisionA = Array.from({ length: n }, (_, i) => i + 1);
			const divisionB = Array.from({ length: n }, (_, i) => i + 1 + n);

			assertAbDivisionRoundRobin(
				divisionA,
				divisionB,
				makeAbDivisionRoundRobinMatches(divisionA, divisionB),
			);
		}
	});

	test("should produce N rounds and N^2 matches total", () => {
		for (const n of [2, 3, 4, 5, 6]) {
			const divisionA = Array.from({ length: n }, (_, i) => i + 1);
			const divisionB = Array.from({ length: n }, (_, i) => i + 1 + n);

			const rounds = makeAbDivisionRoundRobinMatches(divisionA, divisionB);

			expect(rounds).toHaveLength(n);
			expect(rounds.flat()).toHaveLength(n * n);
			expect(rounds.every((round) => round.length === n)).toBe(true);
		}
	});

	test("round 1 is cross-seeded (A[i] vs B[N-1-i])", () => {
		for (const n of [2, 3, 4, 5, 6]) {
			const divisionA = Array.from({ length: n }, (_, i) => i + 1);
			const divisionB = Array.from({ length: n }, (_, i) => i + 1 + n);

			const [firstRound] = makeAbDivisionRoundRobinMatches(
				divisionA,
				divisionB,
			);

			const expected = divisionA.map<[number, number]>((a, i) => [
				a,
				divisionB[n - 1 - i],
			]);
			expect(firstRound).toEqual(expected);
		}
	});

	test("matches the spec example for N=6", () => {
		const divisionA = [1, 2, 3, 4, 5, 6];
		const divisionB = [11, 12, 13, 14, 15, 16];

		const rounds = makeAbDivisionRoundRobinMatches(divisionA, divisionB);

		expect(rounds[0]).toEqual([
			[1, 16],
			[2, 15],
			[3, 14],
			[4, 13],
			[5, 12],
			[6, 11],
		]);
		expect(rounds[1]).toEqual([
			[1, 15],
			[2, 14],
			[3, 13],
			[4, 12],
			[5, 11],
			[6, 16],
		]);
		expect(rounds[2]).toEqual([
			[1, 14],
			[2, 13],
			[3, 12],
			[4, 11],
			[5, 16],
			[6, 15],
		]);
	});

	test("supports uneven divisions where |A| = |B| + 1", () => {
		const divisionA = [1, 2, 3, 4, 5, 6];
		const divisionB = [11, 12, 13, 14, 15];

		const rounds = makeAbDivisionRoundRobinMatches(divisionA, divisionB);

		assertAbDivisionRoundRobin(divisionA, divisionB, rounds);
		expect(rounds).toHaveLength(6);
		expect(rounds.flat()).toHaveLength(5 * 6);
		expect(rounds.every((round) => round.length === 5)).toBe(true);

		const byeCountPerA = new Map(divisionA.map((a) => [a, 0]));
		for (const round of rounds) {
			const playingA = new Set(round.map(([a]) => a));
			for (const a of divisionA) {
				if (!playingA.has(a)) byeCountPerA.set(a, byeCountPerA.get(a)! + 1);
			}
		}
		expect([...byeCountPerA.values()]).toEqual([1, 1, 1, 1, 1, 1]);
	});

	test("supports uneven divisions where |B| = |A| + 1", () => {
		const divisionA = [1, 2, 3, 4, 5];
		const divisionB = [11, 12, 13, 14, 15, 16];

		const rounds = makeAbDivisionRoundRobinMatches(divisionA, divisionB);

		assertAbDivisionRoundRobin(divisionA, divisionB, rounds);
		expect(rounds).toHaveLength(6);
		expect(rounds.flat()).toHaveLength(5 * 6);
		expect(rounds.every((round) => round.length === 5)).toBe(true);

		const byeCountPerB = new Map(divisionB.map((b) => [b, 0]));
		for (const round of rounds) {
			const playingB = new Set(round.map(([, b]) => b));
			for (const b of divisionB) {
				if (!playingB.has(b)) byeCountPerB.set(b, byeCountPerB.get(b)! + 1);
			}
		}
		expect([...byeCountPerB.values()]).toEqual([1, 1, 1, 1, 1, 1]);
	});

	test("handles non-contiguous seed identifiers in each pool", () => {
		const divisionA = [1, 4, 5];
		const divisionB = [9, 10, 12];

		const rounds = makeAbDivisionRoundRobinMatches(divisionA, divisionB);

		assertAbDivisionRoundRobin(divisionA, divisionB, rounds);
		expect(rounds[0]).toEqual([
			[1, 12],
			[4, 10],
			[5, 9],
		]);
	});
});

describe("A/B division group distribution", () => {
	const CASES: ReadonlyArray<readonly [number, number]> = [
		[6, 1],
		[6, 2],
		[6, 3],
		[6, 6],
		[4, 1],
		[4, 2],
		[4, 4],
		[3, 1],
		[3, 3],
		[8, 2],
		[8, 4],
	];

	test("places all teams with equal A/B per group for supported sizes", () => {
		for (const [poolSize, groupCount] of CASES) {
			const divisionA = Array.from({ length: poolSize }, (_, i) => i + 1);
			const divisionB = Array.from(
				{ length: poolSize },
				(_, i) => i + 1 + poolSize,
			);

			const groups = makeAbDivisionGroups(divisionA, divisionB, groupCount);

			expect(groups).toHaveLength(groupCount);

			const perGroupSize = poolSize / groupCount;
			for (const group of groups) {
				expect(group.a).toHaveLength(perGroupSize);
				expect(group.b).toHaveLength(perGroupSize);
			}

			const flatA = groups.flatMap((g) => g.a).sort((x, y) => x - y);
			const flatB = groups.flatMap((g) => g.b).sort((x, y) => x - y);
			expect(flatA).toEqual(divisionA);
			expect(flatB).toEqual(divisionB);
		}
	});

	test("preserves ascending seed order within each group's A and B pools", () => {
		for (const [poolSize, groupCount] of CASES) {
			const divisionA = Array.from({ length: poolSize }, (_, i) => i + 1);
			const divisionB = Array.from(
				{ length: poolSize },
				(_, i) => i + 1 + poolSize,
			);

			const groups = makeAbDivisionGroups(divisionA, divisionB, groupCount);

			for (const group of groups) {
				expect(group.a).toEqual([...group.a].sort((x, y) => x - y));
				expect(group.b).toEqual([...group.b].sort((x, y) => x - y));
			}
		}
	});

	test("is deterministic for identical input", () => {
		const divisionA = [1, 2, 3, 4, 5, 6];
		const divisionB = [7, 8, 9, 10, 11, 12];

		const first = makeAbDivisionGroups(divisionA, divisionB, 2);
		const second = makeAbDivisionGroups(divisionA, divisionB, 2);

		expect(first).toEqual(second);
	});

	test("matches the expected snake distribution for 12 teams, 2 groups", () => {
		const divisionA = [1, 2, 3, 4, 5, 6];
		const divisionB = [7, 8, 9, 10, 11, 12];

		expect(makeAbDivisionGroups(divisionA, divisionB, 2)).toEqual([
			{ a: [1, 4, 5], b: [7, 10, 11] },
			{ a: [2, 3, 6], b: [8, 9, 12] },
		]);
	});

	test("matches the expected snake distribution for 12 teams, 3 groups", () => {
		const divisionA = [1, 2, 3, 4, 5, 6];
		const divisionB = [7, 8, 9, 10, 11, 12];

		expect(makeAbDivisionGroups(divisionA, divisionB, 3)).toEqual([
			{ a: [1, 6], b: [7, 12] },
			{ a: [2, 5], b: [8, 11] },
			{ a: [3, 4], b: [9, 10] },
		]);
	});

	test("single group contains all teams", () => {
		const divisionA = [1, 2, 3, 4];
		const divisionB = [5, 6, 7, 8];

		expect(makeAbDivisionGroups(divisionA, divisionB, 1)).toEqual([
			{ a: divisionA, b: divisionB },
		]);
	});

	test("allows uneven pools with a single group", () => {
		expect(makeAbDivisionGroups([1, 2, 3], [4, 5], 1)).toEqual([
			{ a: [1, 2, 3], b: [4, 5] },
		]);
	});

	test("throws when pools have different sizes and multiple groups", () => {
		expect(() => makeAbDivisionGroups([1, 2, 3], [4, 5], 2)).toThrow();
	});

	test("throws when pool size is not divisible by group count", () => {
		expect(() => makeAbDivisionGroups([1, 2, 3], [4, 5, 6], 2)).toThrow();
	});

	test("throws when group count is not positive", () => {
		expect(() => makeAbDivisionGroups([1], [2], 0)).toThrow();
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
