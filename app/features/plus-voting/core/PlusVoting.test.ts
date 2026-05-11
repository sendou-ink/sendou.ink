import { describe, expect, test } from "vitest";
import { computeFreshPlusTiers, computePassedVoting } from "./PlusVoting";

const result = (
	overrides: Partial<{
		votedId: number;
		tier: number;
		score: number;
		wasSuggested: number;
	}> = {},
) => ({
	votedId: 1,
	tier: 1,
	score: 0,
	wasSuggested: 0,
	...overrides,
});

describe("computePassedVoting", () => {
	test("auto-passes users with 60% or more", () => {
		const results = computePassedVoting([
			result({ votedId: 1, score: 0.2 }),
			result({ votedId: 2, score: 0.5 }),
			result({ votedId: 3, score: 1 }),
		]);

		expect(results.every((r) => r.passedVoting === 1)).toBe(true);
	});

	test("auto-fails users with 40% or less", () => {
		const results = computePassedVoting([
			result({ votedId: 1, score: -0.2 }),
			result({ votedId: 2, score: -0.5 }),
			result({ votedId: 3, score: -1 }),
		]);

		expect(results.every((r) => r.passedVoting === 0)).toBe(true);
	});

	test("auto-passers pass even when exceeding quota", () => {
		const autoPassers = Array.from({ length: 100 }, (_, i) =>
			result({ votedId: i + 1, score: 0.3 }),
		);

		const results = computePassedVoting(autoPassers);

		expect(results.length).toBe(100);
		expect(results.every((r) => r.passedVoting === 1)).toBe(true);
	});

	test("middle zone users pass when quota has remaining slots", () => {
		const results = computePassedVoting([
			result({ votedId: 1, score: 0.3 }),
			result({ votedId: 2, score: 0.1 }),
			result({ votedId: 3, score: 0.05 }),
		]);

		expect(results.find((r) => r.votedId === 1)?.passedVoting).toBe(1);
		expect(results.find((r) => r.votedId === 2)?.passedVoting).toBe(1);
		expect(results.find((r) => r.votedId === 3)?.passedVoting).toBe(1);
	});

	test("nobody from middle zone passes when auto-passers fill the quota", () => {
		const autoPassers = Array.from({ length: 50 }, (_, i) =>
			result({ votedId: i + 1, score: 0.3 }),
		);
		const middleZone = Array.from({ length: 10 }, (_, i) =>
			result({ votedId: 51 + i, score: 0.1 }),
		);

		const results = computePassedVoting([...autoPassers, ...middleZone]);

		const middleResults = results.filter((r) => r.votedId > 50);
		expect(middleResults.every((r) => r.passedVoting === 0)).toBe(true);
	});

	test("middle zone fills remaining slots by highest score", () => {
		const autoPassers = Array.from({ length: 48 }, (_, i) =>
			result({ votedId: i + 1, score: 0.3 }),
		);

		const middleZone = [
			result({ votedId: 100, score: 0.15 }),
			result({ votedId: 101, score: 0.1 }),
			result({ votedId: 102, score: 0.05 }),
			result({ votedId: 103, score: 0.0 }),
		];

		const results = computePassedVoting([...autoPassers, ...middleZone]);

		expect(results.find((r) => r.votedId === 100)?.passedVoting).toBe(1);
		expect(results.find((r) => r.votedId === 101)?.passedVoting).toBe(1);
		expect(results.find((r) => r.votedId === 102)?.passedVoting).toBe(0);
		expect(results.find((r) => r.votedId === 103)?.passedVoting).toBe(0);
	});

	test("tied users at the slot boundary all pass even if it exceeds the quota", () => {
		const autoPassers = Array.from({ length: 47 }, (_, i) =>
			result({ votedId: i + 1, score: 0.3 }),
		);

		const middleZone = [
			result({ votedId: 100, score: 0.15 }), // 48
			result({ votedId: 101, score: 0.1 }), // 49 TIED
			result({ votedId: 102, score: 0.1 }), // 50 TIED
			result({ votedId: 103, score: 0.1 }), // 51 TIED
			result({ votedId: 104, score: 0.1 }), // 52 TIED
			result({ votedId: 200, score: 0.05 }), // 53
		];

		const results = computePassedVoting([...autoPassers, ...middleZone]);

		expect(results.find((r) => r.votedId === 100)?.passedVoting).toBe(1);
		expect(results.find((r) => r.votedId === 101)?.passedVoting).toBe(1);
		expect(results.find((r) => r.votedId === 102)?.passedVoting).toBe(1);
		expect(results.find((r) => r.votedId === 103)?.passedVoting).toBe(1);
		expect(results.find((r) => r.votedId === 104)?.passedVoting).toBe(1);
		expect(results.find((r) => r.votedId === 200)?.passedVoting).toBe(0);
	});

	test("different tiers have different quotas", () => {
		const tier1AutoPassers = Array.from({ length: 49 }, (_, i) =>
			result({ votedId: i + 1, tier: 1, score: 0.3 }),
		);
		const tier1Middle = [result({ votedId: 200, tier: 1, score: 0.1 })];

		const tier2AutoPassers = Array.from({ length: 74 }, (_, i) =>
			result({ votedId: 300 + i, tier: 2, score: 0.3 }),
		);
		const tier2Middle = [result({ votedId: 500, tier: 2, score: 0.1 })];

		const results = computePassedVoting([
			...tier1AutoPassers,
			...tier1Middle,
			...tier2AutoPassers,
			...tier2Middle,
		]);

		expect(results.find((r) => r.votedId === 200)?.passedVoting).toBe(1);
		expect(results.find((r) => r.votedId === 500)?.passedVoting).toBe(1);
	});

	test("exact boundary: score of 0.2 auto-passes", () => {
		const results = computePassedVoting([result({ score: 0.2 })]);

		expect(results[0].passedVoting).toBe(1);
	});

	test("exact boundary: score of -0.2 auto-fails", () => {
		const results = computePassedVoting([result({ score: -0.2 })]);

		expect(results[0].passedVoting).toBe(0);
	});

	test("empty results returns empty array", () => {
		expect(computePassedVoting([])).toEqual([]);
	});
});

describe("computeFreshPlusTiers", () => {
	const withPassed = (
		overrides: Partial<{
			votedId: number;
			tier: number;
			score: number;
			wasSuggested: number;
			passedVoting: number;
		}> = {},
	) => ({
		votedId: 1,
		tier: 1,
		score: 0.5,
		wasSuggested: 0,
		passedVoting: 1,
		...overrides,
	});

	test("passed voting keeps tier", () => {
		const tiers = computeFreshPlusTiers([
			withPassed({ votedId: 1, tier: 1, passedVoting: 1 }),
		]);

		expect(tiers).toEqual([{ userId: 1, plusTier: 1 }]);
	});

	test("failed + suggested = removed", () => {
		const tiers = computeFreshPlusTiers([
			withPassed({
				votedId: 1,
				tier: 1,
				passedVoting: 0,
				wasSuggested: 1,
			}),
		]);

		expect(tiers).toEqual([]);
	});

	test("failed + not suggested = demoted one tier", () => {
		const tiers = computeFreshPlusTiers([
			withPassed({
				votedId: 1,
				tier: 1,
				passedVoting: 0,
				wasSuggested: 0,
			}),
		]);

		expect(tiers).toEqual([{ userId: 1, plusTier: 2 }]);
	});

	test("failed tier 3 + not suggested = removed", () => {
		const tiers = computeFreshPlusTiers([
			withPassed({
				votedId: 1,
				tier: 3,
				passedVoting: 0,
				wasSuggested: 0,
			}),
		]);

		expect(tiers).toEqual([]);
	});

	test("multi-tier user gets best (lowest) tier", () => {
		const tiers = computeFreshPlusTiers([
			withPassed({ votedId: 1, tier: 1, passedVoting: 0, wasSuggested: 0 }),
			withPassed({ votedId: 1, tier: 2, passedVoting: 1 }),
		]);

		expect(tiers).toEqual([{ userId: 1, plusTier: 2 }]);
	});

	test("all fail = no tier", () => {
		const tiers = computeFreshPlusTiers([
			withPassed({
				votedId: 1,
				tier: 3,
				passedVoting: 0,
				wasSuggested: 1,
			}),
		]);

		expect(tiers).toEqual([]);
	});
});
