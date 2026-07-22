import { beforeEach, describe, expect, test } from "vitest";
import { TournamentMatchStatus } from "~/db/tables";
import { EngineBracket } from "../test-utils";

const bracket = new EngineBracket();

describe("Previous and next match update in double elimination stage", () => {
	beforeEach(() => {
		bracket.reset();
	});

	test("should end a match and determine next matches", () => {
		bracket.create({
			name: "Amateur",
			tournamentId: 0,
			type: "double_elimination",
			seeding: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16],
			settings: { seedOrdering: ["natural"], grandFinal: "simple" },
		});

		const before = bracket.match(8); // First match of WB round 2
		expect(before.opponent2?.id).toBeNull();

		bracket.updateMatch({
			id: 0, // First match of WB round 1
			opponent1: { score: 16, result: "win" },
			opponent2: { score: 12 },
		});

		bracket.updateMatch({
			id: 1, // Second match of WB round 1
			opponent1: { score: 13 },
			opponent2: { score: 16, result: "win" },
		});

		bracket.updateMatch({
			id: 15, // First match of LB round 1
			opponent1: { score: 16, result: "win" },
			opponent2: { score: 10 },
		});

		expect(
			bracket.match(8).opponent1?.id, // Determined opponent for WB round 2
		).toBe(bracket.match(0).opponent1?.id); // Winner of first match round 1

		expect(
			bracket.match(8).opponent2?.id, // Determined opponent for WB round 2
		).toBe(bracket.match(1).opponent2?.id); // Winner of second match round 1

		expect(
			bracket.match(15).opponent2?.id, // Determined opponent for LB round 1
		).toBe(bracket.match(1).opponent1?.id); // Loser of second match round 1

		expect(
			bracket.match(19).opponent2?.id, // Determined opponent for LB round 2
		).toBe(bracket.match(0).opponent2?.id); // Loser of first match round 1
	});

	test("should propagate winner when BYE is already in next match in loser bracket", () => {
		bracket.create({
			name: "Example",
			tournamentId: 0,
			type: "double_elimination",
			seeding: [1, 2, 3, null],
			settings: { grandFinal: "simple" },
		});

		bracket.updateMatch({
			id: 1, // Second match of WB round 1
			opponent1: { score: 16, result: "win" },
			opponent2: { score: 12 },
		});

		const loserId = bracket.match(1).opponent2?.id;
		let matchSemiLB = bracket.match(3);

		expect(matchSemiLB.opponent2?.id).toBe(loserId);
		expect(matchSemiLB.opponent2?.result).toBe("win");
		expect(matchSemiLB.status).toBe(TournamentMatchStatus.Completed);

		expect(
			bracket.match(4).opponent2?.id, // Propagated winner in LB Final because of the BYE.
		).toBe(loserId);

		bracket.resetMatchResults(1); // Second match of WB round 1

		matchSemiLB = bracket.match(3);
		expect(matchSemiLB.opponent2?.id).toBeNull();
		expect(matchSemiLB.opponent2?.result).toBeUndefined();
		expect(matchSemiLB.status).toBe(TournamentMatchStatus.Locked);

		expect(bracket.match(4).opponent2?.id).toBeNull(); // Propagated winner is removed.
	});

	test("should determine matches in grand final", () => {
		bracket.create({
			name: "Example",
			tournamentId: 0,
			type: "double_elimination",
			seeding: [1, 2, 3, 4],
			settings: { grandFinal: "double" },
		});

		bracket.updateMatch({
			id: 0, // First match of WB round 1
			opponent1: { score: 16, result: "win" },
			opponent2: { score: 12 },
		});

		bracket.updateMatch({
			id: 1, // Second match of WB round 1
			opponent1: { score: 13 },
			opponent2: { score: 16, result: "win" },
		});

		bracket.updateMatch({
			id: 2, // WB Final
			opponent1: { score: 16, result: "win" },
			opponent2: { score: 9 },
		});

		expect(
			bracket.match(5).opponent1?.id, // Determined opponent for the grand final (round 1)
		).toBe(bracket.match(0).opponent1?.id); // Winner of WB Final

		bracket.updateMatch({
			id: 3, // Only match of LB round 1
			opponent1: { score: 12, result: "win" }, // Team 4
			opponent2: { score: 8 },
		});

		bracket.updateMatch({
			id: 4, // LB Final
			opponent1: { score: 14, result: "win" }, // Team 3
			opponent2: { score: 7 },
		});

		expect(
			bracket.match(5).opponent2?.id, // Determined opponent for the grand final (round 1)
		).toBe(bracket.match(1).opponent2?.id); // Winner of LB Final

		bracket.updateMatch({
			id: 5, // Grand Final round 1
			opponent1: { score: 10 },
			opponent2: { score: 16, result: "win" }, // Team 3
		});

		expect(
			bracket.match(6).opponent2?.id, // Determined opponent for the grand final (round 2)
		).toBe(bracket.match(1).opponent2?.id); // Winner of LB Final

		expect(bracket.match(5).status).toBe(TournamentMatchStatus.Completed); // Grand final (round 1)
		expect(bracket.match(6).status).toBe(TournamentMatchStatus.Ready); // Grand final (round 2)

		bracket.updateMatch({
			id: 6, // Grand Final round 2
			opponent1: { score: 16, result: "win" },
			opponent2: { score: 10 },
		});
	});

	test("should determine next matches and reset them", () => {
		bracket.create({
			name: "Example",
			tournamentId: 0,
			type: "double_elimination",
			seeding: [1, 2, 3, 4],
			settings: { grandFinal: "double" },
		});

		bracket.updateMatch({
			id: 0, // First match of WB round 1
			opponent1: { score: 16, result: "win" },
			opponent2: { score: 12 },
		});

		const beforeReset = bracket.match(3); // Determined opponent for LB round 1
		expect(beforeReset.opponent1?.id).toBe(bracket.match(0).opponent2?.id);
		expect(beforeReset.opponent1?.position).toBe(1); // Must be set.

		bracket.resetMatchResults(0); // First match of WB round 1

		const afterReset = bracket.match(3); // Determined opponent for LB round 1
		expect(afterReset.opponent1?.id).toBeNull();
		expect(afterReset.opponent1?.position).toBe(1); // It must stay.
	});

	test("should choose the correct previous and next matches based on losers ordering", () => {
		bracket.create({
			name: "Amateur",
			tournamentId: 0,
			type: "double_elimination",
			seeding: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16],
			settings: {
				seedOrdering: ["natural", "reverse", "reverse"],
				grandFinal: "simple",
			},
		});

		bracket.updateMatch({ id: 0, opponent1: { result: "win" } }); // WB 1.1
		expect(
			bracket.match(18).opponent2?.id, // Determined opponent for last match of LB round 1 (reverse ordering for losers)
		).toBe(bracket.match(0).opponent2?.id); // Loser of first match round 1

		bracket.updateMatch({ id: 1, opponent1: { result: "win" } }); // WB 1.2
		expect(
			bracket.match(18).opponent1?.id, // Determined opponent for last match of LB round 1 (reverse ordering for losers)
		).toBe(bracket.match(1).opponent2?.id); // Loser of second match round 1

		bracket.updateMatch({ id: 8, opponent1: { result: "win" } }); // WB 2.1
		expect(
			bracket.match(22).opponent1?.id, // Determined opponent for last match of LB round 2 (reverse ordering for losers)
		).toBe(bracket.match(8).opponent2?.id); // Loser of first match round 2

		bracket.updateMatch({ id: 6, opponent1: { result: "win" } }); // WB 1.7
		bracket.updateMatch({ id: 7, opponent1: { result: "win" } }); // WB 1.8
		bracket.updateMatch({ id: 11, opponent1: { result: "win" } }); // WB 2.4
		bracket.updateMatch({ id: 15, opponent1: { result: "win" } }); // LB 1.1
		bracket.updateMatch({ id: 19, opponent1: { result: "win" } }); // LB 2.1

		expect(bracket.match(8).status).toBe(TournamentMatchStatus.Completed); // WB 2.1
	});

	test("should send the losers to the right LB matches in round 1", () => {
		bracket.create({
			name: "Example with inner_outer loser ordering",
			tournamentId: 0,
			type: "double_elimination",
			seeding: [1, 2, 3, 4, 5, 6, 7, 8],
			settings: {
				seedOrdering: ["inner_outer", "inner_outer"],
			},
		});

		expect(bracket.match(7).opponent1?.position).toBe(1);
		expect(bracket.match(7).opponent2?.position).toBe(4);
		expect(bracket.match(8).opponent1?.position).toBe(2);
		expect(bracket.match(8).opponent2?.position).toBe(3);

		// Match of position 1.
		bracket.updateMatch({
			id: 0,
			opponent1: { result: "win" }, // Loser id: 7.
		});

		expect(bracket.match(7).opponent1?.id).toBe(8);

		// Match of position 2.
		bracket.updateMatch({
			id: 1,
			opponent1: { result: "win" }, // Loser id: 4.
		});

		expect(bracket.match(8).opponent1?.id).toBe(5);

		// Match of position 3.
		bracket.updateMatch({
			id: 2,
			opponent1: { result: "win" }, // Loser id: 6.
		});

		expect(bracket.match(8).opponent2?.id).toBe(7);

		// Match of position 4.
		bracket.updateMatch({
			id: 3,
			opponent1: { result: "win" }, // Loser id: 5.
		});

		expect(bracket.match(7).opponent2?.id).toBe(6);
	});
});

describe("Skip first round", () => {
	beforeEach(() => {
		bracket.reset();

		bracket.create({
			name: "Example with double grand final",
			tournamentId: 0,
			type: "double_elimination",
			seeding: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16],
			settings: {
				seedOrdering: ["natural"],
				skipFirstRound: true,
				grandFinal: "double",
			},
		});
	});

	test("should create a double elimination stage with skip first round option", () => {
		expect(bracket.groups().length).toBe(3);
		expect(bracket.rounds().length).toBe(3 + 6 + 2); // One round less in WB.
		expect(bracket.matches().length).toBe(
			4 + 2 + 1 + (4 + 4 + 2 + 2 + 1 + 1) + (1 + 1),
		);

		expect(bracket.round(0).number).toBe(1); // Even though the "real" first round is skipped, the stored first round's number should be 1.

		expect(bracket.match(0).opponent1?.id).toBe(1); // First match of WB.
		expect(bracket.match(7).opponent1?.id).toBe(2); // First match of LB.
	});

	test("should choose the correct previous and next matches", () => {
		bracket.updateMatch({ id: 0, opponent1: { result: "win" } });
		expect(bracket.match(7).opponent1?.id).toBe(2); // First match of LB Round 1 (must stay).
		expect(bracket.match(12).opponent1?.id).toBe(3); // First match of LB Round 2 (must be updated).

		bracket.updateMatch({ id: 1, opponent1: { result: "win" } });
		expect(bracket.match(7).opponent2?.id).toBe(4); // First match of LB Round 1 (must stay).
		expect(bracket.match(11).opponent1?.id).toBe(7); // Second match of LB Round 2 (must be updated).

		bracket.updateMatch({ id: 4, opponent1: { result: "win" } }); // First match of WB Round 2.
		expect(bracket.match(18).opponent1?.id).toBe(5); // First match of LB Round 4.

		bracket.updateMatch({ id: 7, opponent1: { result: "win" } }); // First match of LB Round 1.
		expect(bracket.match(11).opponent2?.id).toBe(2); // First match of LB Round 2.

		for (let i = 2; i < 21; i++)
			bracket.updateMatch({ id: i, opponent1: { result: "win" } });

		expect(bracket.match(15).opponent1?.id).toBe(7); // First match of LB Round 3.

		expect(bracket.match(21).opponent1?.id).toBe(1); // GF Round 1.
		expect(bracket.match(21).opponent2?.id).toBe(9); // GF Round 1.

		bracket.updateMatch({ id: 21, opponent2: { result: "win" } });

		expect(bracket.match(21).opponent1?.id).toBe(1); // GF Round 2.
		expect(bracket.match(22).opponent2?.id).toBe(9); // GF Round 2.

		bracket.updateMatch({ id: 22, opponent2: { result: "win" } });
	});
});
