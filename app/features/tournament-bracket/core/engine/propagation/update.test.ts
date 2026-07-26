import { beforeEach, describe, expect, test } from "vitest";
import { createResolved } from "../create";
import * as Engine from "../index";
import type { BracketData, ResolvedCreateBracketInput } from "../types";

const EXAMPLE: ResolvedCreateBracketInput = {
	type: "double_elimination",
	seeding: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16],
	settings: {},
};

describe("Update matches", () => {
	let data: BracketData;

	beforeEach(() => {
		data = createResolved(EXAMPLE);
	});

	test("should start a match", () => {
		expect(Engine.matchStatus(data, 0)).toBe("STARTED");

		data = Engine.reportResult(data, {
			matchId: 0,
			scores: [0, 0],
		}).data;

		expect(Engine.matchStatus(data, 0)).toBe("STARTED");
		expect(matchById(data, 0).opponent1?.score).toBe(0);
	});

	test("should update the scores for a match", () => {
		data = Engine.reportResult(data, {
			matchId: 0,
			scores: [2, 1],
		}).data;

		const after = matchById(data, 0);
		expect(Engine.matchStatus(data, 0)).toBe("STARTED");
		expect(after.opponent1?.score).toBe(2);

		// Id should stay. It shouldn't be overwritten.
		expect(after.opponent1?.id).toBe(1);
	});

	test("should end the match by only setting the winner", () => {
		expect(matchById(data, 0).winnerSide).toBeFalsy();

		data = Engine.reportResult(data, {
			matchId: 0,
			winnerSide: "opponent1",
		}).data;

		expect(Engine.matchStatus(data, 0)).toBe("COMPLETED");
		expect(matchById(data, 0).winnerSide).toBe("opponent1");
	});

	test("should change the winner of the match and update in the next match", () => {
		data = Engine.reportResult(data, {
			matchId: 0,
			winnerSide: "opponent1",
		}).data;

		expect(matchById(data, 8).opponent1?.id).toBe(1);

		data = Engine.reportResult(data, {
			matchId: 0,
			winnerSide: "opponent2",
		}).data;

		expect(Engine.matchStatus(data, 0)).toBe("COMPLETED");
		expect(matchById(data, 0).winnerSide).toBe("opponent2");

		expect(Engine.matchStatus(data, 8)).toBe("PENDING");
		expect(matchById(data, 8).opponent1?.id).toBe(16);
	});

	test("should update the status of the next match", () => {
		data = Engine.reportResult(data, {
			matchId: 0,
			winnerSide: "opponent1",
		}).data;

		expect(Engine.matchStatus(data, 8)).toBe("PENDING");

		data = Engine.reportResult(data, {
			matchId: 1,
			winnerSide: "opponent1",
		}).data;

		expect(Engine.matchStatus(data, 8)).toBe("STARTED");
	});

	test("should remove results from a match without score", () => {
		data = Engine.reportResult(data, {
			matchId: 0,
			winnerSide: "opponent1",
		}).data;

		data = Engine.resetMatchResults(data, 0).data;

		expect(Engine.matchStatus(data, 0)).toBe("STARTED");
		expect(matchById(data, 0).winnerSide).toBeFalsy();
	});

	test("should remove results from a match with score", () => {
		data = Engine.reportResult(data, {
			matchId: 0,
			scores: [16, 12],
			winnerSide: "opponent1",
		}).data;

		data = Engine.resetMatchResults(data, 0).data;

		expect(Engine.matchStatus(data, 0)).toBe("STARTED");
		expect(matchById(data, 0).winnerSide).toBeFalsy();
	});

	test("should keep the scores as they are if none given", () => {
		data = Engine.reportResult(data, {
			matchId: 1,
			scores: [1, 0],
		}).data;

		data = Engine.reportResult(data, { matchId: 1 }).data;

		const after = matchById(data, 1);
		expect(Engine.matchStatus(data, 1)).toBe("STARTED");
		expect(after.opponent1?.score).toBe(1);
		expect(after.opponent2?.score).toBe(0);
	});

	test("should end the match by setting the winner and the scores", () => {
		data = Engine.reportResult(data, {
			matchId: 1,
			scores: [6, 3],
			winnerSide: "opponent2",
		}).data;

		const after = matchById(data, 1);
		expect(Engine.matchStatus(data, 1)).toBe("COMPLETED");

		expect(after.winnerSide).toBe("opponent2");
		expect(after.opponent1?.score).toBe(6);
		expect(after.opponent2?.score).toBe(3);
	});
});

describe("Locked matches", () => {
	let data: BracketData;

	beforeEach(() => {
		data = createResolved(EXAMPLE);
	});

	test("should throw when the matches leading to the match have not been completed yet", () => {
		expect(() => Engine.reportResult(data, { matchId: 0 })).not.toThrow(); // No problem when no previous match.

		expect(() => Engine.reportResult(data, { matchId: 8 })).toThrow(
			"The match is locked.",
		); // First match of WB Round 2.
		expect(() => Engine.reportResult(data, { matchId: 15 })).toThrow(
			"The match is locked.",
		); // First match of LB Round 1.
		expect(() => Engine.reportResult(data, { matchId: 19 })).toThrow(
			"The match is locked.",
		); // First match of LB Round 1.
		expect(() => Engine.reportResult(data, { matchId: 23 })).toThrow(
			"The match is locked.",
		); // First match of LB Round 3.
	});
});

function matchById(data: BracketData, id: number) {
	const found = data.match.find((match) => match.id === id);
	if (!found) throw new Error(`Match ${id} not found`);

	return found;
}
