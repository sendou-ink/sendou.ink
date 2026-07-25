import { beforeEach, describe, expect, test } from "vitest";
import { EngineBracket } from "../test-utils";

const bracket = new EngineBracket();

const example = {
	type: "double_elimination" as const,
	seeding: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16],
	settings: {},
};

describe("Update matches", () => {
	beforeEach(() => {
		bracket.reset();
		bracket.create(example);
	});

	test("should start a match", () => {
		expect(bracket.matchStatus(0)).toBe("STARTED");

		bracket.updateMatch({
			id: 0,
			opponent1: { score: 0 },
			opponent2: { score: 0 },
		});

		const after = bracket.match(0);
		expect(bracket.matchStatus(0)).toBe("STARTED");
		expect(after.opponent1?.score).toBe(0);
	});

	test("should update the scores for a match", () => {
		bracket.updateMatch({
			id: 0,
			opponent1: { score: 2 },
			opponent2: { score: 1 },
		});

		const after = bracket.match(0);
		expect(bracket.matchStatus(0)).toBe("STARTED");
		expect(after.opponent1?.score).toBe(2);

		// Id should stay. It shouldn't be overwritten.
		expect(after.opponent1?.id).toBe(1);
	});

	test("should end the match by only setting the winner", () => {
		const before = bracket.match(0);
		expect(before.winnerSide).toBeFalsy();

		bracket.updateMatch({
			id: 0,
			winnerSide: "opponent1",
		});

		const after = bracket.match(0);
		expect(bracket.matchStatus(0)).toBe("COMPLETED");
		expect(after.winnerSide).toBe("opponent1");
	});

	test("should change the winner of the match and update in the next match", () => {
		bracket.updateMatch({
			id: 0,
			winnerSide: "opponent1",
		});

		expect(bracket.match(8).opponent1?.id).toBe(1);

		bracket.updateMatch({
			id: 0,
			winnerSide: "opponent2",
		});

		const after = bracket.match(0);
		expect(bracket.matchStatus(0)).toBe("COMPLETED");
		expect(after.winnerSide).toBe("opponent2");

		const nextMatch = bracket.match(8);
		expect(bracket.matchStatus(8)).toBe("PENDING");
		expect(nextMatch.opponent1?.id).toBe(16);
	});

	test("should update the status of the next match", () => {
		bracket.updateMatch({
			id: 0,
			winnerSide: "opponent1",
		});

		expect(bracket.matchStatus(8)).toBe("PENDING");

		bracket.updateMatch({
			id: 1,
			winnerSide: "opponent1",
		});

		expect(bracket.matchStatus(8)).toBe("STARTED");
	});

	test("should remove results from a match without score", () => {
		bracket.updateMatch({
			id: 0,
			winnerSide: "opponent1",
		});

		bracket.resetMatchResults(0);

		const after = bracket.match(0);
		expect(bracket.matchStatus(0)).toBe("STARTED");
		expect(after.winnerSide).toBeFalsy();
	});

	test("should remove results from a match with score", () => {
		bracket.updateMatch({
			id: 0,
			opponent1: { score: 16 },
			opponent2: { score: 12 },
			winnerSide: "opponent1",
		});

		bracket.resetMatchResults(0);

		const after = bracket.match(0);
		expect(bracket.matchStatus(0)).toBe("STARTED");
		expect(after.winnerSide).toBeFalsy();
	});

	test("should not set the other score to 0 if only one given", () => {
		// It shouldn't be our decision to set the other score to 0.

		bracket.updateMatch({
			id: 1,
			opponent1: { score: 1 },
		});

		const after = bracket.match(1);
		expect(bracket.matchStatus(1)).toBe("STARTED");
		expect(after.opponent1?.score).toBe(1);
		expect(after.opponent2?.score).toBeFalsy();
	});

	test("should end the match by setting the winner and the scores", () => {
		bracket.updateMatch({
			id: 1,
			opponent1: { score: 6 },
			opponent2: { score: 3 },
			winnerSide: "opponent2",
		});

		const after = bracket.match(1);
		expect(bracket.matchStatus(1)).toBe("COMPLETED");

		expect(after.winnerSide).toBe("opponent2");
		expect(after.opponent1?.score).toBe(6);
		expect(after.opponent2?.score).toBe(3);
	});
});

describe("Give opponent IDs when updating", () => {
	beforeEach(() => {
		bracket.reset();

		bracket.create({
			type: "double_elimination",
			seeding: [1, 2, 3, 4],
			settings: {},
		});
	});

	test("should update the right opponents based on their IDs", () => {
		bracket.updateMatch({
			id: 0,
			opponent1: {
				id: 4,
				score: 10,
			},
			opponent2: {
				id: 1,
				score: 5,
			},
		});

		// Actual results must be inverted.
		const after = bracket.match(0);
		expect(after.opponent1?.score).toBe(5);
		expect(after.opponent2?.score).toBe(10);
	});

	test("should update the right opponent based on its ID, the other one is the remaining one", () => {
		bracket.updateMatch({
			id: 0,
			opponent1: {
				id: 4,
				score: 10,
			},
		});

		// Actual results must be inverted.
		const after = bracket.match(0);
		expect(after.opponent1?.score).toBeFalsy();
		expect(after.opponent2?.score).toBe(10);
	});

	test("should throw when the given opponent ID does not exist in the match", () => {
		expect(() =>
			bracket.updateMatch({
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
		bracket.reset();
		bracket.create(example);
	});

	test("should throw when the matches leading to the match have not been completed yet", () => {
		bracket.updateMatch({ id: 0 }); // No problem when no previous match.
		expect(() => bracket.updateMatch({ id: 8 })).toThrow(
			"The match is locked.",
		); // First match of WB Round 2.
		expect(() => bracket.updateMatch({ id: 15 })).toThrow(
			"The match is locked.",
		); // First match of LB Round 1.
		expect(() => bracket.updateMatch({ id: 19 })).toThrow(
			"The match is locked.",
		); // First match of LB Round 1.
		expect(() => bracket.updateMatch({ id: 23 })).toThrow(
			"The match is locked.",
		); // First match of LB Round 3.
	});
});
