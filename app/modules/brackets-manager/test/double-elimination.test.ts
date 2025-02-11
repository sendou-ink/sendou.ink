import { beforeEach, describe, expect, test } from "vitest";
import { Status } from "~/db/types";
import { InMemoryDatabase } from "~/modules/brackets-memory-db";
import { BracketsManager } from "../manager";

const storage = new InMemoryDatabase();
const manager = new BracketsManager(storage);

describe("Delete stage", () => {
	beforeEach(() => {
		storage.reset();
	});

	test("should create a double elimination stage", () => {
		manager.create({
			name: "Amateur",
			tournamentId: 0,
			type: "double_elimination",
			seeding: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16],
			settings: { seedOrdering: ["natural"], grandFinal: "simple" },
		});

		const stage = storage.select<any>("stage", 0);
		expect(stage.name).toBe("Amateur");
		expect(stage.type).toBe("double_elimination");

		expect(storage.select<any>("group")!.length).toBe(3);
		expect(storage.select<any>("round")!.length).toBe(4 + 6 + 1);
		expect(storage.select<any>("match")!.length).toBe(30);
	});

	test("should create a tournament with 256+ tournaments", () => {
		manager.create({
			name: "Example with 256 participants",
			tournamentId: 0,
			type: "double_elimination",
			settings: { size: 256 },
		});
	});

	test("should create a tournament with a double grand final", () => {
		manager.create({
			name: "Example with double grand final",
			tournamentId: 0,
			type: "double_elimination",
			seeding: [1, 2, 3, 4, 5, 6, 7, 8],
			settings: { grandFinal: "double", seedOrdering: ["natural"] },
		});

		expect(storage.select<any>("group")!.length).toBe(3);
		expect(storage.select<any>("round")!.length).toBe(3 + 4 + 2);
		expect(storage.select<any>("match")!.length).toBe(15);
	});
});

describe("Previous and next match update in double elimination stage", () => {
	beforeEach(() => {
		storage.reset();
	});

	test("should end a match and determine next matches", () => {
		manager.create({
			name: "Amateur",
			tournamentId: 0,
			type: "double_elimination",
			seeding: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16],
			settings: { seedOrdering: ["natural"], grandFinal: "simple" },
		});

		const before = storage.select<any>("match", 8); // First match of WB round 2
		expect(before.opponent2.id).toBeNull();

		manager.update.match({
			id: 0, // First match of WB round 1
			opponent1: { score: 16, result: "win" },
			opponent2: { score: 12 },
		});

		manager.update.match({
			id: 1, // Second match of WB round 1
			opponent1: { score: 13 },
			opponent2: { score: 16, result: "win" },
		});

		manager.update.match({
			id: 15, // First match of LB round 1
			opponent1: { score: 16, result: "win" },
			opponent2: { score: 10 },
		});

		expect(
			storage.select<any>("match", 8).opponent1.id, // Determined opponent for WB round 2
		).toBe(storage.select<any>("match", 0).opponent1.id); // Winner of first match round 1

		expect(
			storage.select<any>("match", 8).opponent2.id, // Determined opponent for WB round 2
		).toBe(storage.select<any>("match", 1).opponent2.id); // Winner of second match round 1

		expect(
			storage.select<any>("match", 15).opponent2.id, // Determined opponent for LB round 1
		).toBe(storage.select<any>("match", 1).opponent1.id); // Loser of second match round 1

		expect(
			storage.select<any>("match", 19).opponent2.id, // Determined opponent for LB round 2
		).toBe(storage.select<any>("match", 0).opponent2.id); // Loser of first match round 1
	});

	test("should propagate winner when BYE is already in next match in loser bracket", () => {
		manager.create({
			name: "Example",
			tournamentId: 0,
			type: "double_elimination",
			seeding: [1, 2, 3, null],
			settings: { grandFinal: "simple" },
		});

		manager.update.match({
			id: 1, // Second match of WB round 1
			opponent1: { score: 16, result: "win" },
			opponent2: { score: 12 },
		});

		const loserId = storage.select<any>("match", 1).opponent2.id;
		let matchSemiLB = storage.select<any>("match", 3);

		expect(matchSemiLB.opponent2.id).toBe(loserId);
		expect(matchSemiLB.opponent2.result).toBe("win");
		expect(matchSemiLB.status).toBe(Status.Completed);

		expect(
			storage.select<any>("match", 4).opponent2.id, // Propagated winner in LB Final because of the BYE.
		).toBe(loserId);

		manager.reset.matchResults(1); // Second match of WB round 1

		matchSemiLB = storage.select<any>("match", 3);
		expect(matchSemiLB.opponent2.id).toBeNull();
		expect(matchSemiLB.opponent2.result).toBeUndefined();
		expect(matchSemiLB.status).toBe(Status.Locked);

		expect(storage.select<any>("match", 4).opponent2.id).toBeNull(); // Propagated winner is removed.
	});

	test("should determine matches in grand final", () => {
		manager.create({
			name: "Example",
			tournamentId: 0,
			type: "double_elimination",
			seeding: [1, 2, 3, 4],
			settings: { grandFinal: "double" },
		});

		manager.update.match({
			id: 0, // First match of WB round 1
			opponent1: { score: 16, result: "win" },
			opponent2: { score: 12 },
		});

		manager.update.match({
			id: 1, // Second match of WB round 1
			opponent1: { score: 13 },
			opponent2: { score: 16, result: "win" },
		});

		manager.update.match({
			id: 2, // WB Final
			opponent1: { score: 16, result: "win" },
			opponent2: { score: 9 },
		});

		expect(
			storage.select<any>("match", 5).opponent1.id, // Determined opponent for the grand final (round 1)
		).toBe(storage.select<any>("match", 0).opponent1.id); // Winner of WB Final

		manager.update.match({
			id: 3, // Only match of LB round 1
			opponent1: { score: 12, result: "win" }, // Team 4
			opponent2: { score: 8 },
		});

		manager.update.match({
			id: 4, // LB Final
			opponent1: { score: 14, result: "win" }, // Team 3
			opponent2: { score: 7 },
		});

		expect(
			storage.select<any>("match", 5).opponent2.id, // Determined opponent for the grand final (round 1)
		).toBe(storage.select<any>("match", 1).opponent2.id); // Winner of LB Final

		manager.update.match({
			id: 5, // Grand Final round 1
			opponent1: { score: 10 },
			opponent2: { score: 16, result: "win" }, // Team 3
		});

		expect(
			storage.select<any>("match", 6).opponent2.id, // Determined opponent for the grand final (round 2)
		).toBe(storage.select<any>("match", 1).opponent2.id); // Winner of LB Final

		expect(storage.select<any>("match", 5).status).toBe(Status.Completed); // Grand final (round 1)
		expect(storage.select<any>("match", 6).status).toBe(Status.Ready); // Grand final (round 2)

		manager.update.match({
			id: 6, // Grand Final round 2
			opponent1: { score: 16, result: "win" },
			opponent2: { score: 10 },
		});
	});

	test("should determine next matches and reset them", () => {
		manager.create({
			name: "Example",
			tournamentId: 0,
			type: "double_elimination",
			seeding: [1, 2, 3, 4],
			settings: { grandFinal: "double" },
		});

		manager.update.match({
			id: 0, // First match of WB round 1
			opponent1: { score: 16, result: "win" },
			opponent2: { score: 12 },
		});

		const beforeReset = storage.select<any>("match", 3); // Determined opponent for LB round 1
		expect(beforeReset.opponent1.id).toBe(
			storage.select<any>("match", 0).opponent2.id,
		);
		expect(beforeReset.opponent1.position).toBe(1); // Must be set.

		manager.reset.matchResults(0); // First match of WB round 1

		const afterReset = storage.select<any>("match", 3); // Determined opponent for LB round 1
		expect(afterReset.opponent1.id).toBeNull();
		expect(afterReset.opponent1.position).toBe(1); // It must stay.
	});

	test("should choose the correct previous and next matches based on losers ordering", () => {
		manager.create({
			name: "Amateur",
			tournamentId: 0,
			type: "double_elimination",
			seeding: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16],
			settings: {
				seedOrdering: ["natural", "reverse", "reverse"],
				grandFinal: "simple",
			},
		});

		manager.update.match({ id: 0, opponent1: { result: "win" } }); // WB 1.1
		expect(
			storage.select<any>("match", 18).opponent2.id, // Determined opponent for last match of LB round 1 (reverse ordering for losers)
		).toBe(storage.select<any>("match", 0).opponent2.id); // Loser of first match round 1

		manager.update.match({ id: 1, opponent1: { result: "win" } }); // WB 1.2
		expect(
			storage.select<any>("match", 18).opponent1.id, // Determined opponent for last match of LB round 1 (reverse ordering for losers)
		).toBe(storage.select<any>("match", 1).opponent2.id); // Loser of second match round 1

		manager.update.match({ id: 8, opponent1: { result: "win" } }); // WB 2.1
		expect(
			storage.select<any>("match", 22).opponent1.id, // Determined opponent for last match of LB round 2 (reverse ordering for losers)
		).toBe(storage.select<any>("match", 8).opponent2.id); // Loser of first match round 2

		manager.update.match({ id: 6, opponent1: { result: "win" } }); // WB 1.7
		manager.update.match({ id: 7, opponent1: { result: "win" } }); // WB 1.8
		manager.update.match({ id: 11, opponent1: { result: "win" } }); // WB 2.4
		manager.update.match({ id: 15, opponent1: { result: "win" } }); // LB 1.1
		manager.update.match({ id: 19, opponent1: { result: "win" } }); // LB 2.1

		expect(storage.select<any>("match", 8).status).toBe(Status.Completed); // WB 2.1
	});

	test("should send the losers to the right LB matches in round 1", () => {
		manager.create({
			name: "Example with inner_outer loser ordering",
			tournamentId: 0,
			type: "double_elimination",
			seeding: [1, 2, 3, 4, 5, 6, 7, 8],
			settings: {
				seedOrdering: ["inner_outer", "inner_outer"],
			},
		});

		expect(storage.select<any>("match", 7).opponent1.position).toBe(1);
		expect(storage.select<any>("match", 7).opponent2.position).toBe(4);
		expect(storage.select<any>("match", 8).opponent1.position).toBe(2);
		expect(storage.select<any>("match", 8).opponent2.position).toBe(3);

		// Match of position 1.
		manager.update.match({
			id: 0,
			opponent1: { result: "win" }, // Loser id: 7.
		});

		expect(storage.select<any>("match", 7).opponent1.id).toBe(8);

		// Match of position 2.
		manager.update.match({
			id: 1,
			opponent1: { result: "win" }, // Loser id: 4.
		});

		expect(storage.select<any>("match", 8).opponent1.id).toBe(5);

		// Match of position 3.
		manager.update.match({
			id: 2,
			opponent1: { result: "win" }, // Loser id: 6.
		});

		expect(storage.select<any>("match", 8).opponent2.id).toBe(7);

		// Match of position 4.
		manager.update.match({
			id: 3,
			opponent1: { result: "win" }, // Loser id: 5.
		});

		expect(storage.select<any>("match", 7).opponent2.id).toBe(6);
	});
});

describe("Skip first round", () => {
	beforeEach(() => {
		storage.reset();

		manager.create({
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
		expect(storage.select<any>("group")!.length).toBe(3);
		expect(storage.select<any>("round")!.length).toBe(3 + 6 + 2); // One round less in WB.
		expect(storage.select<any>("match")!.length).toBe(
			4 + 2 + 1 + (4 + 4 + 2 + 2 + 1 + 1) + (1 + 1),
		);

		expect(storage.select<any>("round", 0).number).toBe(1); // Even though the "real" first round is skipped, the stored first round's number should be 1.

		expect(storage.select<any>("match", 0).opponent1.id).toBe(1); // First match of WB.
		expect(storage.select<any>("match", 7).opponent1.id).toBe(2); // First match of LB.
	});

	test("should choose the correct previous and next matches", () => {
		manager.update.match({ id: 0, opponent1: { result: "win" } });
		expect(storage.select<any>("match", 7).opponent1.id).toBe(2); // First match of LB Round 1 (must stay).
		expect(storage.select<any>("match", 12).opponent1.id).toBe(3); // First match of LB Round 2 (must be updated).

		manager.update.match({ id: 1, opponent1: { result: "win" } });
		expect(storage.select<any>("match", 7).opponent2.id).toBe(4); // First match of LB Round 1 (must stay).
		expect(storage.select<any>("match", 11).opponent1.id).toBe(7); // Second match of LB Round 2 (must be updated).

		manager.update.match({ id: 4, opponent1: { result: "win" } }); // First match of WB Round 2.
		expect(storage.select<any>("match", 18).opponent1.id).toBe(5); // First match of LB Round 4.

		manager.update.match({ id: 7, opponent1: { result: "win" } }); // First match of LB Round 1.
		expect(storage.select<any>("match", 11).opponent2.id).toBe(2); // First match of LB Round 2.

		for (let i = 2; i < 21; i++)
			manager.update.match({ id: i, opponent1: { result: "win" } });

		expect(storage.select<any>("match", 15).opponent1.id).toBe(7); // First match of LB Round 3.

		expect(storage.select<any>("match", 21).opponent1.id).toBe(1); // GF Round 1.
		expect(storage.select<any>("match", 21).opponent2.id).toBe(9); // GF Round 1.

		manager.update.match({ id: 21, opponent2: { result: "win" } });

		expect(storage.select<any>("match", 21).opponent1.id).toBe(1); // GF Round 2.
		expect(storage.select<any>("match", 22).opponent2.id).toBe(9); // GF Round 2.

		manager.update.match({ id: 22, opponent2: { result: "win" } });
	});
});
