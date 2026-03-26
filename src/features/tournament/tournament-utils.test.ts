import { describe, expect, it } from "vitest";
import type { ParsedBracket } from "../tournament-bracket/core/Progression";
import {
	compareTeamsForOrdering,
	findTeamInsertPosition,
	getBracketProgressionLabel,
	sortTeamsBySeeding,
	type TeamForOrdering,
} from "./tournament-utils";

const createTeam = (
	id: number,
	options: {
		seed?: number | null;
		members?: number;
		avgSeedingSkillOrdinal?: number | null;
		createdAt?: number;
		startingBracketIdx?: number | null;
	} = {},
): TeamForOrdering => ({
	id,
	seed: options.seed ?? null,
	members: { length: options.members ?? 4 },
	avgSeedingSkillOrdinal: options.avgSeedingSkillOrdinal ?? 100,
	createdAt: options.createdAt ?? id,
	startingBracketIdx: options.startingBracketIdx ?? null,
});

const MIN_MEMBERS = 4;

describe("compareTeamsForOrdering", () => {
	describe("full teams priority", () => {
		it("places full teams before not-full teams", () => {
			const fullTeam = createTeam(1, { members: 4 });
			const notFullTeam = createTeam(2, { members: 3 });

			const result = compareTeamsForOrdering(
				fullTeam,
				notFullTeam,
				MIN_MEMBERS,
			);

			expect(result).toBeLessThan(0);
		});

		it("places not-full teams after full teams", () => {
			const notFullTeam = createTeam(1, { members: 3 });
			const fullTeam = createTeam(2, { members: 4 });

			const result = compareTeamsForOrdering(
				notFullTeam,
				fullTeam,
				MIN_MEMBERS,
			);

			expect(result).toBeGreaterThan(0);
		});
	});

	describe("seed priority", () => {
		it("orders by seed when both have seeds", () => {
			const team1 = createTeam(1, { seed: 1 });
			const team2 = createTeam(2, { seed: 2 });

			const result = compareTeamsForOrdering(team1, team2, MIN_MEMBERS);

			expect(result).toBeLessThan(0);
		});

		it("places seeded team before unseeded team when unseeded has no skill", () => {
			const seededTeam = createTeam(1, { seed: 5 });
			const unseededTeam = createTeam(2);

			const result = compareTeamsForOrdering(
				seededTeam,
				unseededTeam,
				MIN_MEMBERS,
			);

			expect(result).toBeLessThan(0);
		});

		it("compares by skill ordinal when both full teams have skill but only one has seed", () => {
			const seededLowSkill = createTeam(1, {
				seed: 5,
				avgSeedingSkillOrdinal: 100,
			});
			const unseededHighSkill = createTeam(2, { avgSeedingSkillOrdinal: 300 });

			const result = compareTeamsForOrdering(
				seededLowSkill,
				unseededHighSkill,
				MIN_MEMBERS,
			);

			expect(result).toBeGreaterThan(0);
		});

		it("places seeded team first when only seeded team has skill ordinal", () => {
			const seededWithSkill = createTeam(1, {
				seed: 5,
				avgSeedingSkillOrdinal: 100,
			});
			const unseededNoSkill = createTeam(2);

			const result = compareTeamsForOrdering(
				seededWithSkill,
				unseededNoSkill,
				MIN_MEMBERS,
			);

			expect(result).toBeLessThan(0);
		});

		it("places seeded team first when not-full team has higher skill", () => {
			const seededFull = createTeam(1, {
				seed: 5,
				avgSeedingSkillOrdinal: 100,
			});
			const unseededNotFull = createTeam(2, {
				members: 3,
				avgSeedingSkillOrdinal: 500,
			});

			const result = compareTeamsForOrdering(
				seededFull,
				unseededNotFull,
				MIN_MEMBERS,
			);

			expect(result).toBeLessThan(0);
		});
	});

	describe("skill ordinal priority", () => {
		it("orders by skill ordinal when no seeds (higher skill first)", () => {
			const highSkill = createTeam(1, { avgSeedingSkillOrdinal: 300 });
			const lowSkill = createTeam(2, { avgSeedingSkillOrdinal: 100 });

			const result = compareTeamsForOrdering(highSkill, lowSkill, MIN_MEMBERS);

			expect(result).toBeLessThan(0);
		});

		it("places team with skill before team without skill", () => {
			const withSkill = createTeam(1, { avgSeedingSkillOrdinal: 100 });
			const withoutSkill = createTeam(2);

			const result = compareTeamsForOrdering(
				withSkill,
				withoutSkill,
				MIN_MEMBERS,
			);

			expect(result).toBeLessThan(0);
		});
	});

	describe("createdAt tiebreaker", () => {
		it("orders by createdAt when all else is equal", () => {
			const olderTeam = createTeam(1, { createdAt: 100 });
			const newerTeam = createTeam(2, { createdAt: 200 });

			const result = compareTeamsForOrdering(olderTeam, newerTeam, MIN_MEMBERS);

			expect(result).toBeLessThan(0);
		});
	});
});

describe("sortTeamsBySeeding", () => {
	it("sorts teams correctly with mixed properties", () => {
		const teams = [
			createTeam(1, { members: 3, avgSeedingSkillOrdinal: 500 }),
			createTeam(2, { seed: 2 }),
			createTeam(3, { avgSeedingSkillOrdinal: 300 }),
			createTeam(4, { seed: 1 }),
			createTeam(5, { avgSeedingSkillOrdinal: 400 }),
			createTeam(6, { members: 3 }),
		];

		const sorted = sortTeamsBySeeding(teams, MIN_MEMBERS);

		expect(sorted.map((t) => t.id)).toEqual([5, 3, 4, 2, 1, 6]);
	});

	it("does not mutate original array", () => {
		const teams = [
			createTeam(2, { avgSeedingSkillOrdinal: 100 }),
			createTeam(1, { avgSeedingSkillOrdinal: 200 }),
		];

		sortTeamsBySeeding(teams, MIN_MEMBERS);

		expect(teams[0].id).toBe(2);
	});
});

describe("findTeamInsertPosition", () => {
	it("inserts at beginning when new team should be first", () => {
		const team1 = createTeam(1, { avgSeedingSkillOrdinal: 100 });
		const team2 = createTeam(2, { avgSeedingSkillOrdinal: 200 });
		const teamMap = new Map([
			[1, team1],
			[2, team2],
		]);
		const existingOrder = [2, 1];
		const newTeam = createTeam(3, { avgSeedingSkillOrdinal: 300 });

		const position = findTeamInsertPosition(
			existingOrder,
			newTeam,
			teamMap,
			MIN_MEMBERS,
		);

		expect(position).toBe(0);
	});

	it("inserts at end when new team should be last", () => {
		const team1 = createTeam(1, { avgSeedingSkillOrdinal: 100 });
		const team2 = createTeam(2, { avgSeedingSkillOrdinal: 200 });
		const teamMap = new Map([
			[1, team1],
			[2, team2],
		]);
		const existingOrder = [2, 1];
		const newTeam = createTeam(3, { avgSeedingSkillOrdinal: 50 });

		const position = findTeamInsertPosition(
			existingOrder,
			newTeam,
			teamMap,
			MIN_MEMBERS,
		);

		expect(position).toBe(2);
	});

	it("inserts in middle based on comparison", () => {
		const team1 = createTeam(1, { avgSeedingSkillOrdinal: 100 });
		const team2 = createTeam(2, { avgSeedingSkillOrdinal: 300 });
		const team3 = createTeam(3, { avgSeedingSkillOrdinal: 200 });
		const teamMap = new Map([
			[1, team1],
			[2, team2],
			[3, team3],
		]);
		const existingOrder = [2, 3, 1];
		const newTeam = createTeam(4, { avgSeedingSkillOrdinal: 150 });

		const position = findTeamInsertPosition(
			existingOrder,
			newTeam,
			teamMap,
			MIN_MEMBERS,
		);

		expect(position).toBe(2);
	});

	it("handles empty existing order", () => {
		const teamMap = new Map<number, TeamForOrdering>();
		const existingOrder: number[] = [];
		const newTeam = createTeam(1, { avgSeedingSkillOrdinal: 100 });

		const position = findTeamInsertPosition(
			existingOrder,
			newTeam,
			teamMap,
			MIN_MEMBERS,
		);

		expect(position).toBe(0);
	});

	it("skips missing teams in map", () => {
		const team1 = createTeam(1, { avgSeedingSkillOrdinal: 100 });
		const teamMap = new Map([[1, team1]]);
		const existingOrder = [2, 1];
		const newTeam = createTeam(3, { avgSeedingSkillOrdinal: 150 });

		const position = findTeamInsertPosition(
			existingOrder,
			newTeam,
			teamMap,
			MIN_MEMBERS,
		);

		expect(position).toBe(1);
	});
});

describe("sortTeamsBySeeding with startingBracketIdx", () => {
	it("orders by startingBracketIdx first", () => {
		const teams = [
			createTeam(1, {
				startingBracketIdx: 1,
				avgSeedingSkillOrdinal: 500,
			}),
			createTeam(2, {
				startingBracketIdx: 0,
				avgSeedingSkillOrdinal: 100,
			}),
			createTeam(3, {
				startingBracketIdx: 0,
				avgSeedingSkillOrdinal: 200,
			}),
		];

		const sorted = sortTeamsBySeeding(teams, MIN_MEMBERS);

		expect(sorted.map((t) => t.id)).toEqual([3, 2, 1]);
	});

	it("uses seeds within same bracket", () => {
		const teams = [
			createTeam(1, { seed: 2 }),
			createTeam(2, { seed: 1 }),
			createTeam(3, { avgSeedingSkillOrdinal: 500 }),
		];

		const sorted = sortTeamsBySeeding(teams, MIN_MEMBERS);

		expect(sorted.map((t) => t.id)).toEqual([3, 2, 1]);
	});
});

const createBracket = (name: string): ParsedBracket => ({
	name,
	type: "single_elimination",
	settings: {},
	requiresCheckIn: false,
});

describe("getBracketProgressionLabel", () => {
	it("returns single bracket name when only one bracket is reachable", () => {
		const progression: ParsedBracket[] = [createBracket("Main Bracket")];

		const result = getBracketProgressionLabel(0, progression);

		expect(result).toBe("Main Bracket");
	});

	it("returns common prefix when multiple brackets share a prefix", () => {
		const progression: ParsedBracket[] = [
			createBracket("Alpha"),
			createBracket("Alpha A"),
			createBracket("Alpha B"),
		];

		progression[1].sources = [{ bracketIdx: 0, placements: [1] }];
		progression[2].sources = [{ bracketIdx: 0, placements: [2] }];

		const result = getBracketProgressionLabel(0, progression);

		expect(result).toBe("Alpha");
	});

	it("trims whitespace from common prefix", () => {
		const progression: ParsedBracket[] = [
			createBracket("Playoff "),
			createBracket("Playoff Winner"),
			createBracket("Playoff Loser"),
		];

		progression[1].sources = [{ bracketIdx: 0, placements: [1] }];
		progression[2].sources = [{ bracketIdx: 0, placements: [2] }];

		const result = getBracketProgressionLabel(0, progression);

		expect(result).toBe("Playoff");
	});

	it("returns deepest bracket name when no common prefix exists", () => {
		const progression: ParsedBracket[] = [
			createBracket("Round Robin"),
			createBracket("Winner Bracket"),
			createBracket("Loser Bracket"),
			createBracket("Grand Finals"),
		];

		progression[1].sources = [{ bracketIdx: 0, placements: [1] }];
		progression[2].sources = [{ bracketIdx: 0, placements: [2] }];
		progression[3].sources = [
			{ bracketIdx: 1, placements: [1] },
			{ bracketIdx: 2, placements: [1] },
		];

		const result = getBracketProgressionLabel(0, progression);

		expect(result).toBe("Grand Finals");
	});

	it("handles single character prefix", () => {
		const progression: ParsedBracket[] = [
			createBracket("A"),
			createBracket("A1"),
			createBracket("A2"),
		];

		progression[1].sources = [{ bracketIdx: 0, placements: [1] }];
		progression[2].sources = [{ bracketIdx: 0, placements: [2] }];

		const result = getBracketProgressionLabel(0, progression);

		expect(result).toBe("A");
	});

	it("handles bracket progression with multiple levels", () => {
		const progression: ParsedBracket[] = [
			createBracket("Qualifier"),
			createBracket("Group A"),
			createBracket("Group B"),
			createBracket("Finals"),
		];

		progression[1].sources = [{ bracketIdx: 0, placements: [1, 2] }];
		progression[2].sources = [{ bracketIdx: 0, placements: [3, 4] }];
		progression[3].sources = [
			{ bracketIdx: 1, placements: [1] },
			{ bracketIdx: 2, placements: [1] },
		];

		const result = getBracketProgressionLabel(0, progression);

		expect(result).toBe("Finals");
	});

	it("returns bracket name for progression with partial common prefix", () => {
		const progression: ParsedBracket[] = [
			createBracket("Swiss"),
			createBracket("Swiss Upper"),
			createBracket("Swiss Lower"),
		];

		progression[1].sources = [{ bracketIdx: 0, placements: [1, 2] }];
		progression[2].sources = [{ bracketIdx: 0, placements: [3, 4] }];

		const result = getBracketProgressionLabel(0, progression);

		expect(result).toBe("Swiss");
	});

	it("handles empty string prefix by returning deepest bracket", () => {
		const progression: ParsedBracket[] = [
			createBracket("A"),
			createBracket("B"),
			createBracket("C"),
		];

		progression[1].sources = [{ bracketIdx: 0, placements: [1] }];
		progression[2].sources = [{ bracketIdx: 1, placements: [1] }];

		const result = getBracketProgressionLabel(0, progression);

		expect(result).toBe("C");
	});
});
