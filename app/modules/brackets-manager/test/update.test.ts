import { beforeEach, describe, expect, test } from "vitest";
import { Status } from "~/db/types";
import { InMemoryDatabase } from "~/modules/brackets-memory-db";
import { BracketsManager } from "../manager";

const storage = new InMemoryDatabase();
const manager = new BracketsManager(storage);

const example = {
	name: "Amateur",
	tournamentId: 0,
	type: "double_elimination",
	seeding: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16],
	settings: { seedOrdering: ["natural"] },
} as any;

describe("Update matches", () => {
	beforeEach(() => {
		storage.reset();
		manager.create(example);
	});

	test("should start a match", () => {
		const before = storage.select<any>("match", 0);
		expect(before.status).toBe(Status.Ready);

		manager.update.match({
			id: 0,
			opponent1: { score: 0 },
			opponent2: { score: 0 },
		});

		const after = storage.select<any>("match", 0);
		expect(after.status).toBe(Status.Running);
	});

	test("should update the scores for a match and set it to running", () => {
		manager.update.match({
			id: 0,
			opponent1: { score: 2 },
			opponent2: { score: 1 },
		});

		const after = storage.select<any>("match", 0);
		expect(after.status).toBe(Status.Running);
		expect(after.opponent1.score).toBe(2);

		// Name should stay. It shouldn't be overwritten.
		expect(after.opponent1.id).toBe(1);
	});

	test("should end the match by only setting the winner", () => {
		const before = storage.select<any>("match", 0);
		expect(before.opponent1.result).toBeFalsy();

		manager.update.match({
			id: 0,
			opponent1: { result: "win" },
		});

		const after = storage.select<any>("match", 0);
		expect(after.status).toBe(Status.Completed);
		expect(after.opponent1.result).toBe("win");
		expect(after.opponent2.result).toBe("loss");
	});

	test("should change the winner of the match and update in the next match", () => {
		manager.update.match({
			id: 0,
			opponent1: { result: "win" },
		});

		expect(storage.select<any>("match", 8).opponent1.id).toBe(1);

		manager.update.match({
			id: 0,
			opponent2: { result: "win" },
		});

		const after = storage.select<any>("match", 0);
		expect(after.status).toBe(Status.Completed);
		expect(after.opponent1.result).toBe("loss");
		expect(after.opponent2.result).toBe("win");

		const nextMatch = storage.select<any>("match", 8);
		expect(nextMatch.status).toBe(Status.Waiting);
		expect(nextMatch.opponent1.id).toBe(2);
	});

	test("should update the status of the next match", () => {
		manager.update.match({
			id: 0,
			opponent1: { result: "win" },
		});

		expect(storage.select<any>("match", 8).status).toBe(Status.Waiting);

		manager.update.match({
			id: 1,
			opponent1: { result: "win" },
		});

		expect(storage.select<any>("match", 8).status).toBe(Status.Ready);
	});

	test("should end the match by setting winner and loser", () => {
		manager.update.match({
			id: 0,
			status: Status.Running,
		});

		manager.update.match({
			id: 0,
			opponent1: { result: "win" },
			opponent2: { result: "loss" },
		});

		const after = storage.select<any>("match", 0);
		expect(after.status).toBe(Status.Completed);
		expect(after.opponent1.result).toBe("win");
		expect(after.opponent2.result).toBe("loss");
	});

	test("should remove results from a match without score", () => {
		manager.update.match({
			id: 0,
			opponent1: { result: "win" },
			opponent2: { result: "loss" },
		});

		manager.reset.matchResults(0);

		const after = storage.select<any>("match", 0);
		expect(after.status).toBe(Status.Ready);
		expect(after.opponent1.result).toBeFalsy();
		expect(after.opponent2.result).toBeFalsy();
	});

	test("should remove results from a match with score", () => {
		manager.update.match({
			id: 0,
			opponent1: { score: 16, result: "win" },
			opponent2: { score: 12, result: "loss" },
		});

		manager.reset.matchResults(0);

		const after = storage.select<any>("match", 0);
		expect(after.status).toBe(Status.Running);
		expect(after.opponent1.result).toBeFalsy();
		expect(after.opponent2.result).toBeFalsy();
	});

	test("should not set the other score to 0 if only one given", () => {
		// It shouldn't be our decision to set the other score to 0.

		manager.update.match({
			id: 1,
			opponent1: { score: 1 },
		});

		const after = storage.select<any>("match", 1);
		expect(after.status).toBe(Status.Running);
		expect(after.opponent1.score).toBe(1);
		expect(after.opponent2.score).toBeFalsy();
	});

	test("should end the match by setting the winner and the scores", () => {
		manager.update.match({
			id: 1,
			opponent1: { score: 6 },
			opponent2: { result: "win", score: 3 },
		});

		const after = storage.select<any>("match", 1);
		expect(after.status).toBe(Status.Completed);

		expect(after.opponent1.result).toBe("loss");
		expect(after.opponent1.score).toBe(6);

		expect(after.opponent2.result).toBe("win");
		expect(after.opponent2.score).toBe(3);
	});

	test("should throw if two winners", () => {
		expect(() =>
			manager.update.match({
				id: 3,
				opponent1: { result: "win" },
				opponent2: { result: "win" },
			}),
		).toThrow("There are two winners.");

		expect(() =>
			manager.update.match({
				id: 3,
				opponent1: { result: "loss" },
				opponent2: { result: "loss" },
			}),
		).toThrow("There are two losers.");
	});
});

describe("Give opponent IDs when updating", () => {
	beforeEach(() => {
		storage.reset();

		manager.create({
			name: "Amateur",
			tournamentId: 0,
			type: "double_elimination",
			seeding: [1, 2, 3, 4],
			settings: { seedOrdering: ["natural"] },
		});
	});

	test("should update the right opponents based on their IDs", () => {
		manager.update.match({
			id: 0,
			opponent1: {
				id: 2,
				score: 10,
			},
			opponent2: {
				id: 1,
				score: 5,
			},
		});

		// Actual results must be inverted.
		const after = storage.select<any>("match", 0);
		expect(after.opponent1.score).toBe(5);
		expect(after.opponent2.score).toBe(10);
	});

	test("should update the right opponent based on its ID, the other one is the remaining one", () => {
		manager.update.match({
			id: 0,
			opponent1: {
				id: 2,
				score: 10,
			},
		});

		// Actual results must be inverted.
		const after = storage.select<any>("match", 0);
		expect(after.opponent1.score).toBeFalsy();
		expect(after.opponent2.score).toBe(10);
	});

	test("should throw when the given opponent ID does not exist in the match", () => {
		expect(() =>
			manager.update.match({
				id: 0,
				opponent1: {
					id: 3, // Belongs to match id 1.
					score: 10,
				},
			}),
		).toThrow(/The given opponent[12] ID does not exist in this match./);
	});
});

describe("Locked matches", () => {
	beforeEach(() => {
		storage.reset();
		manager.create(example);
	});

	test("should throw when the matches leading to the match have not been completed yet", () => {
		manager.update.match({ id: 0 }); // No problem when no previous match.
		expect(() => manager.update.match({ id: 8 })).toThrow(
			"The match is locked.",
		); // First match of WB Round 2.
		expect(() => manager.update.match({ id: 15 })).toThrow(
			"The match is locked.",
		); // First match of LB Round 1.
		expect(() => manager.update.match({ id: 19 })).toThrow(
			"The match is locked.",
		); // First match of LB Round 1.
		expect(() => manager.update.match({ id: 23 })).toThrow(
			"The match is locked.",
		); // First match of LB Round 3.
	});
});
