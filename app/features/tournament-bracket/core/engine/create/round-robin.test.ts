import { describe, expect, test } from "vitest";
import type { BracketData, MatchData } from "../types";
import { createResolved } from "./index";

describe("Create a round-robin stage", () => {
	test("creates a round-robin stage", () => {
		const data = createResolved({
			type: "round_robin",
			seeding: [1, 2, 3, 4, 5, 6, 7, 8],
			settings: { groupCount: 2 },
		});

		expect(data.stage[0].type).toBe("round_robin");

		expect(data.group.length).toBe(2);
		expect(data.round.length).toBe(6);
		expect(data.match.length).toBe(12);
	});

	test("drops empty slots instead of creating BYE matches", () => {
		const data = createResolved({
			type: "round_robin",
			seeding: [1, 2, 3, 4, 5, null, null, null],
			settings: { groupCount: 2 },
		});

		// 5 teams in 2 groups -> groups of 3 and 2 with no BYE matches at all.
		expect(data.match.length).toBe(4);
		for (const match of data.match) {
			expect(match.opponent1?.id).not.toBeNull();
			expect(match.opponent2?.id).not.toBeNull();
		}
	});

	test("does not pad a short group with empty rounds when teams divide unevenly", () => {
		// the 2-team group must be a single-round single-match group, not padded with BYE-only rounds
		const data = createResolved({
			type: "round_robin",
			seeding: [1, 2, 3, 4, 5],
			settings: { groupCount: 2 },
		});

		const shortGroup = data.group.find(
			(group) =>
				data.match.filter(
					(match) => match.groupId === group.id && isRealMatch(match),
				).length === 1,
		)!;

		const rounds = data.round.filter(
			(round) => round.groupId === shortGroup.id,
		);
		const matches = data.match.filter(
			(match) => match.groupId === shortGroup.id,
		);
		const realMatch = matches.find(isRealMatch)!;
		const realMatchRound = rounds.find(
			(round) => round.id === realMatch.roundId,
		)!;

		// No BYE matches and no empty rounds, just the single match in round 1.
		expect(matches.length).toBe(1);
		expect(rounds.length).toBe(1);
		expect(realMatchRound.number).toBe(1);
	});

	test("creates a round-robin stage split across multiple groups", () => {
		const data = createResolved({
			type: "round_robin",
			seeding: Array.from({ length: 16 }, (_, i) => i + 1),
			settings: {
				groupCount: 4,
			},
		});

		expect(data.group.length).toBe(4);
		expect(data.round.length).toBe(4 * 3);
		expect(data.match.length).toBe(4 * 3 * 2);
	});

	test("orders the groups with snake seeding", () => {
		const data = createResolved({
			type: "round_robin",
			seeding: [1, 2, 3, 4, 5, 6, 7, 8],
			settings: {
				groupCount: 2,
			},
		});

		expect(matchById(data, 0).opponent1?.id).toBe(1);
		expect(matchById(data, 0).opponent2?.id).toBe(8);
	});

	test("throws if no group count given", () => {
		expect(() =>
			createResolved({
				type: "round_robin",
				seeding: [1, 2, 3, 4],
				settings: {},
			}),
		).toThrow("You must specify a group count for round-robin stages.");
	});

	test("throws if the group count is not strictly positive", () => {
		expect(() =>
			createResolved({
				type: "round_robin",
				seeding: [1, 2, 3, 4],
				settings: {
					groupCount: 0,
				},
			}),
		).toThrow("You must provide a strictly positive group count.");
	});

	test("creates an A/B divisions round-robin where every A team plays every B team once", () => {
		const seeding = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
		// alternate A (0) / B (1) so that seed order 1..12 gives A=[1,3,5,7,9,11], B=[2,4,6,8,10,12]
		const abDivisions = seeding.map((_, i) => (i % 2 === 0 ? 0 : 1)) as (
			| 0
			| 1
		)[];

		const data = createResolved({
			type: "round_robin",
			seeding,
			abDivisions,
			settings: {
				groupCount: 1,
				hasAbDivisions: true,
			},
		});

		expect(data.group.length).toBe(1);
		expect(data.round.length).toBe(6);
		expect(data.match.length).toBe(36);

		const divisionAIds = new Set([1, 3, 5, 7, 9, 11]);
		const divisionBIds = new Set([2, 4, 6, 8, 10, 12]);
		const pairings = new Set<string>();

		for (const match of data.match) {
			const aId = match.opponent1?.id;
			const bId = match.opponent2?.id;

			expect(divisionAIds.has(aId!)).toBe(true);
			expect(divisionBIds.has(bId!)).toBe(true);

			const key = `${aId}-${bId}`;
			expect(pairings.has(key)).toBe(false);
			pairings.add(key);
		}

		expect(pairings.size).toBe(36);
	});

	test("throws when A/B divisions are requested but abDivisions is missing", () => {
		expect(() =>
			createResolved({
				type: "round_robin",
				seeding: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
				settings: {
					groupCount: 1,
					hasAbDivisions: true,
				},
			}),
		).toThrow("abDivisions must be provided when hasAbDivisions is enabled.");
	});

	test("creates an A/B divisions round-robin with uneven (±1) divisions and a single group", () => {
		const data = createResolved({
			type: "round_robin",
			seeding: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
			abDivisions: [0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0],
			settings: {
				groupCount: 1,
				hasAbDivisions: true,
			},
		});

		expect(data.group.length).toBe(1);
		expect(data.round.length).toBe(6);
		expect(data.match.length).toBe(30);
	});

	test("throws when A/B divisions are uneven with multiple groups", () => {
		expect(() =>
			createResolved({
				type: "round_robin",
				seeding: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
				abDivisions: [0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0],
				settings: {
					groupCount: 2,
					hasAbDivisions: true,
				},
			}),
		).toThrow("Uneven A/B divisions are only supported with a single group.");
	});
});

function isRealMatch(match: MatchData) {
	return match.opponent1?.id != null && match.opponent2?.id != null;
}

function matchById(data: BracketData, id: number) {
	const found = data.match.find((match) => match.id === id);
	if (!found) throw new Error(`Match ${id} not found`);

	return found;
}
