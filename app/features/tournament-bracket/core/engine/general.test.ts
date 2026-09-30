import { beforeEach, describe, expect, test } from "vitest";
import { createResolved } from "./create";
import * as Engine from "./index";
import type { BracketData } from "./types";

describe("BYE handling", () => {
	test("propagates BYEs through the brackets", () => {
		const data = createResolved({
			type: "double_elimination",
			seeding: [1, null, null, null],
			settings: {},
		});

		expect(matchById(data, 2).opponent1?.id).toBe(1);
		expect(matchById(data, 2).opponent2).toBe(null);

		expect(matchById(data, 3).opponent1).toBe(null);
		expect(matchById(data, 3).opponent2).toBe(null);

		expect(matchById(data, 4).opponent1).toBe(null);
		expect(matchById(data, 4).opponent2).toBe(null);

		expect(matchById(data, 5).opponent1?.id).toBe(1);
		expect(matchById(data, 5).opponent2).toBe(null);
	});

	test("handles incomplete seeding during creation", () => {
		const data = createResolved({
			type: "double_elimination",
			seeding: [1, 2, null, null],
			settings: {},
		});

		expect(matchById(data, 0).opponent1?.id).toBe(1);
		expect(matchById(data, 0).opponent2).toBe(null);

		expect(matchById(data, 1).opponent1?.id).toBe(2);
		expect(matchById(data, 1).opponent2).toBe(null);
	});
});

describe("Position checks", () => {
	let data: BracketData;

	beforeEach(() => {
		data = createResolved({
			type: "double_elimination",
			seeding: [1, 2, 3, 4, 5, 6, 7, 8],
			settings: {},
		});
	});

	test("does not have a position when we don't need the origin of a participant", () => {
		const matchFromWbRound2 = matchById(data, 4);
		expect(matchFromWbRound2.opponent1?.position).toBe(undefined);
		expect(matchFromWbRound2.opponent2?.position).toBe(undefined);

		const matchFromLbRound2 = matchById(data, 9);
		expect(matchFromLbRound2.opponent2?.position).toBe(undefined);

		const matchFromGrandFinal = matchById(data, 13);
		expect(matchFromGrandFinal.opponent1?.position).toBe(undefined);
	});

	test("has a position where we need the origin of a participant", () => {
		const matchFromWbRound1 = matchById(data, 0);
		expect(matchFromWbRound1.opponent1?.position).toBe(1);
		expect(matchFromWbRound1.opponent2?.position).toBe(8);

		const matchFromLbRound1 = matchById(data, 7);
		expect(matchFromLbRound1.opponent1?.position).toBe(1);
		expect(matchFromLbRound1.opponent2?.position).toBe(2);

		const matchFromLbRound2 = matchById(data, 9);
		expect(matchFromLbRound2.opponent1?.position).toBe(2);

		const matchFromGrandFinal = matchById(data, 13);
		expect(matchFromGrandFinal.opponent2?.position).toBe(1);
	});
});

describe("Special cases", () => {
	test("pads the seeding with BYEs to the next power of two", () => {
		const data = createResolved({
			type: "single_elimination",
			seeding: [1, 2, 3, 4, 5, 6, 7],
			settings: {},
		});

		expect(matchById(data, 0).opponent1?.id).toBe(1);
		expect(matchById(data, 0).opponent2).toBe(null);
	});

	test("throws if the participant count of a stage is less than two", () => {
		expect(() =>
			createResolved({
				type: "single_elimination",
				seeding: [],
				settings: {},
			}),
		).toThrow("Impossible to create a stage with less than 2 participants.");

		expect(() =>
			createResolved({
				type: "single_elimination",
				seeding: [1],
				settings: {},
			}),
		).toThrow("Impossible to create a stage with less than 2 participants.");
	});
});

describe("Seeding and ordering in elimination", () => {
	let data: BracketData;

	beforeEach(() => {
		data = createResolved({
			type: "double_elimination",
			seeding: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16],
			settings: {},
		});
	});

	test("has the good orderings everywhere", () => {
		const firstRoundMatchWB = matchById(data, 0);
		expect(firstRoundMatchWB.opponent1?.position).toBe(1);
		expect(firstRoundMatchWB.opponent2?.position).toBe(16);

		const firstRoundMatchLB = matchById(data, 15);
		expect(firstRoundMatchLB.opponent1?.position).toBe(1);
		expect(firstRoundMatchLB.opponent2?.position).toBe(2);

		const secondRoundMatchLB = matchById(data, 19);
		expect(secondRoundMatchLB.opponent1?.position).toBe(2);

		const secondRoundSecondMatchLB = matchById(data, 20);
		expect(secondRoundSecondMatchLB.opponent1?.position).toBe(1);

		const fourthRoundMatchLB = matchById(data, 25);
		expect(fourthRoundMatchLB.opponent1?.position).toBe(2);

		const finalRoundMatchLB = matchById(data, 28);
		expect(finalRoundMatchLB.opponent1?.position).toBe(1);
	});
});

describe("Reset match", () => {
	test("resets results of a match", () => {
		// Seeds 1 and 2 are placed into the same first-round match (positions 1
		// and 8) so that match 0 is a real two-team match under the default
		// space_between ordering, while the rest of the bracket is BYEs.
		let data = createResolved({
			type: "single_elimination",
			seeding: [1, null, null, null, null, null, null, 2],
			settings: {},
		});

		data = Engine.reportResult(data, {
			matchId: 0,
			scores: [16, 12],
			winnerSide: "opponent1",
		}).data;

		expect(matchById(data, 0).opponent1?.score).toBe(16);
		expect(matchById(data, 0).opponent2?.score).toBe(12);
		expect(matchById(data, 0).winnerSide).toBe("opponent1");

		expect(matchById(data, 4).winnerSide).toBe("opponent1");
		expect(matchById(data, 4).opponent2).toBe(null);

		expect(matchById(data, 6).winnerSide).toBe("opponent1");
		expect(matchById(data, 6).opponent2).toBe(null);

		data = Engine.resetMatchResults(data, 0).data; // Score stays as is.

		expect(matchById(data, 0).opponent1?.score).toBe(16);
		expect(matchById(data, 0).opponent2?.score).toBe(12);
		expect(matchById(data, 0).winnerSide).toBe(null);

		expect(matchById(data, 4).winnerSide).toBe(null);
		expect(matchById(data, 4).opponent2).toBe(null);

		expect(matchById(data, 6).winnerSide).toBe(null);
		expect(matchById(data, 6).opponent2).toBe(null);
	});

	test("throws when at least one of the following match is locked", () => {
		let data = createResolved({
			type: "single_elimination",
			seeding: [1, 2, 3, 4],
			settings: {},
		});

		for (const matchId of [0, 1, 2]) {
			data = Engine.reportResult(data, {
				matchId,
				scores: [16, 12],
				winnerSide: "opponent1",
			}).data;
		}

		expect(() => Engine.resetMatchResults(data, 0)).toThrow(
			"The match is locked.",
		);
	});
});

describe("Engine data immutability", () => {
	test("engine operations return new data and leave the input untouched", () => {
		const initial = createResolved({
			type: "single_elimination",
			seeding: [1, 2, 3, 4],
			settings: {},
		});

		const snapshot = structuredClone(initial);

		const afterReport = Engine.reportResult(initial, {
			matchId: 0,
			scores: [16, 12],
			winnerSide: "opponent1",
		});

		expect(initial).toEqual(snapshot);
		expect(afterReport.data.match[0].winnerSide).toBe("opponent1");

		const afterReset = Engine.resetMatchResults(afterReport.data, 0);

		expect(afterReport.data.match[0].winnerSide).toBe("opponent1");
		expect(afterReset.data.match[0].winnerSide).toBeNull();
	});

	test("changedMatches contains only genuinely changed rows", () => {
		const initial = createResolved({
			type: "single_elimination",
			seeding: [1, 2, 3, 4],
			settings: {},
		});

		const afterReport = Engine.reportResult(initial, {
			matchId: 0,
			scores: [16, 12],
			winnerSide: "opponent1",
		});

		const changedIds = afterReport.changedMatches.map((match) => match.id);
		expect(changedIds).toContain(0); // The reported match.
		expect(changedIds).toContain(2); // The final receiving the winner.
		expect(changedIds).not.toContain(1); // The other semi is untouched.
	});
});

function matchById(data: BracketData, id: number) {
	const found = data.match.find((match) => match.id === id);
	if (!found) throw new Error(`Match ${id} not found`);

	return found;
}
