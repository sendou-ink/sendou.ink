import { beforeEach, describe, expect, test } from "vitest";
import { EngineBracket } from "../test-utils";

const bracket = new EngineBracket();

describe("Create a round-robin stage", () => {
	beforeEach(() => {
		bracket.reset();
	});

	test("should create a round-robin stage", () => {
		const example = {
			type: "round_robin" as const,
			seeding: [1, 2, 3, 4, 5, 6, 7, 8],
			settings: { groupCount: 2 },
		};

		bracket.create(example);

		const stage = bracket.stage();
		expect(stage.type).toBe(example.type);

		expect(bracket.groups().length).toBe(2);
		expect(bracket.rounds().length).toBe(6);
		expect(bracket.matches().length).toBe(12);
	});

	test("should drop empty slots instead of creating BYE matches", () => {
		bracket.create({
			type: "round_robin",
			seeding: [1, 2, 3, 4, 5, null, null, null],
			settings: { groupCount: 2 },
		});

		// 5 teams in 2 groups -> groups of 3 and 2 with no BYE matches at all.
		const matches = bracket.matches();
		expect(matches.length).toBe(4);
		for (const match of matches) {
			expect(match.opponent1?.id).not.toBeNull();
			expect(match.opponent2?.id).not.toBeNull();
		}
	});

	test("should not pad a short group with empty rounds when teams divide unevenly", () => {
		// 5 teams in 2 groups -> groups of 3 and 2. The 2-team group must be a
		// clean single-round single-match group, not padded with BYE-only rounds
		// that strand the real match in a later round.
		bracket.create({
			type: "round_robin",
			seeding: [1, 2, 3, 4, 5],
			settings: { groupCount: 2 },
		});

		const isRealMatch = (match: {
			opponent1: { id: number | null } | null;
			opponent2: { id: number | null } | null;
		}) => match.opponent1?.id != null && match.opponent2?.id != null;

		const shortGroup = bracket.groups().find((group) => {
			const matches = bracket.matches({ groupId: group.id });
			return matches.filter(isRealMatch).length === 1;
		})!;

		const rounds = bracket.rounds({ groupId: shortGroup.id });
		const matches = bracket.matches({ groupId: shortGroup.id });
		const realMatch = matches.find(isRealMatch)!;
		const realMatchRound = rounds.find(
			(round) => round.id === realMatch.roundId,
		)!;

		// No BYE matches and no empty rounds, just the single match in round 1.
		expect(matches.length).toBe(1);
		expect(rounds.length).toBe(1);
		expect(realMatchRound.number).toBe(1);
	});

	test("should create a round-robin stage split across multiple groups", () => {
		bracket.create({
			type: "round_robin",
			seeding: Array.from({ length: 16 }, (_, i) => i + 1),
			settings: {
				groupCount: 4,
			},
		});

		expect(bracket.groups().length).toBe(4);
		expect(bracket.rounds().length).toBe(4 * 3);
		expect(bracket.matches().length).toBe(4 * 3 * 2);
	});

	test("should order the groups with snake seeding", () => {
		bracket.create({
			type: "round_robin",
			seeding: [1, 2, 3, 4, 5, 6, 7, 8],
			settings: {
				groupCount: 2,
			},
		});

		expect(bracket.match(0).opponent1?.id).toBe(1);
		expect(bracket.match(0).opponent2?.id).toBe(8);
	});

	test("should throw if no group count given", () => {
		expect(() =>
			bracket.create({
				type: "round_robin",
				seeding: [1, 2, 3, 4],
			}),
		).toThrow("You must specify a group count for round-robin stages.");
	});

	test("should throw if the group count is not strictly positive", () => {
		expect(() =>
			bracket.create({
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

		bracket.create({
			type: "round_robin",
			seeding,
			abDivisions,
			settings: {
				groupCount: 1,
				hasAbDivisions: true,
			},
		});

		expect(bracket.groups().length).toBe(1);
		expect(bracket.rounds().length).toBe(6);
		expect(bracket.matches().length).toBe(36);

		const divisionAIds = new Set([1, 3, 5, 7, 9, 11]);
		const divisionBIds = new Set([2, 4, 6, 8, 10, 12]);
		const pairings = new Set<string>();

		for (const match of bracket.matches()) {
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
			bracket.create({
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
		const seeding = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
		bracket.create({
			type: "round_robin",
			seeding,
			abDivisions: [0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0],
			settings: {
				groupCount: 1,
				hasAbDivisions: true,
			},
		});

		expect(bracket.groups().length).toBe(1);
		expect(bracket.rounds().length).toBe(6);
		expect(bracket.matches().length).toBe(30);
	});

	test("throws when A/B divisions are uneven with multiple groups", () => {
		expect(() =>
			bracket.create({
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
