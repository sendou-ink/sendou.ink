import { beforeEach, describe, expect, test } from "vitest";
import { createResolved } from "./create";
import * as Engine from "./index";
import { EngineBracket } from "./test-utils";

const bracket = new EngineBracket();

describe("BYE handling", () => {
	beforeEach(() => {
		bracket.reset();
	});

	test("should propagate BYEs through the brackets", () => {
		bracket.create({
			type: "double_elimination",
			seeding: [1, null, null, null],
			settings: {},
		});

		expect(bracket.match(2).opponent1?.id).toBe(1);
		expect(bracket.match(2).opponent2).toBe(null);

		expect(bracket.match(3).opponent1).toBe(null);
		expect(bracket.match(3).opponent2).toBe(null);

		expect(bracket.match(4).opponent1).toBe(null);
		expect(bracket.match(4).opponent2).toBe(null);

		expect(bracket.match(5).opponent1?.id).toBe(1);
		expect(bracket.match(5).opponent2).toBe(null);
	});

	test("should handle incomplete seeding during creation", () => {
		bracket.create({
			type: "double_elimination",
			seeding: [1, 2, null, null],
			settings: {},
		});

		expect(bracket.match(0).opponent1?.id).toBe(1);
		expect(bracket.match(0).opponent2).toBe(null);

		expect(bracket.match(1).opponent1?.id).toBe(2);
		expect(bracket.match(1).opponent2).toBe(null);
	});
});

describe("Position checks", () => {
	beforeEach(() => {
		bracket.reset();

		bracket.create({
			type: "double_elimination",
			seeding: [1, 2, 3, 4, 5, 6, 7, 8],
			settings: {},
		});
	});

	test("should not have a position when we don't need the origin of a participant", () => {
		const matchFromWbRound2 = bracket.match(4);
		expect(matchFromWbRound2.opponent1?.position).toBe(undefined);
		expect(matchFromWbRound2.opponent2?.position).toBe(undefined);

		const matchFromLbRound2 = bracket.match(9);
		expect(matchFromLbRound2.opponent2?.position).toBe(undefined);

		const matchFromGrandFinal = bracket.match(13);
		expect(matchFromGrandFinal.opponent1?.position).toBe(undefined);
	});

	test("should have a position where we need the origin of a participant", () => {
		const matchFromWbRound1 = bracket.match(0);
		expect(matchFromWbRound1.opponent1?.position).toBe(1);
		expect(matchFromWbRound1.opponent2?.position).toBe(8);

		const matchFromLbRound1 = bracket.match(7);
		expect(matchFromLbRound1.opponent1?.position).toBe(1);
		expect(matchFromLbRound1.opponent2?.position).toBe(2);

		const matchFromLbRound2 = bracket.match(9);
		expect(matchFromLbRound2.opponent1?.position).toBe(2);

		const matchFromGrandFinal = bracket.match(13);
		expect(matchFromGrandFinal.opponent2?.position).toBe(1);
	});
});

describe("Special cases", () => {
	beforeEach(() => {
		bracket.reset();
	});

	test("should pad the seeding with BYEs to the next power of two", () => {
		bracket.create({
			type: "single_elimination",
			seeding: [1, 2, 3, 4, 5, 6, 7],
			settings: {},
		});

		expect(bracket.match(0).opponent1?.id).toBe(1);
		expect(bracket.match(0).opponent2).toBe(null);
	});

	test("should throw if the participant count of a stage is less than two", () => {
		expect(() =>
			bracket.create({
				type: "single_elimination",
				seeding: [],
			}),
		).toThrow("Impossible to create a stage with less than 2 participants.");

		expect(() =>
			bracket.create({
				type: "single_elimination",
				seeding: [1],
			}),
		).toThrow("Impossible to create a stage with less than 2 participants.");
	});
});

describe("Seeding and ordering in elimination", () => {
	beforeEach(() => {
		bracket.reset();

		bracket.create({
			type: "double_elimination",
			seeding: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16],
			settings: {},
		});
	});

	test("should have the good orderings everywhere", () => {
		const firstRoundMatchWB = bracket.match(0);
		expect(firstRoundMatchWB.opponent1?.position).toBe(1);
		expect(firstRoundMatchWB.opponent2?.position).toBe(16);

		const firstRoundMatchLB = bracket.match(15);
		expect(firstRoundMatchLB.opponent1?.position).toBe(1);
		expect(firstRoundMatchLB.opponent2?.position).toBe(2);

		const secondRoundMatchLB = bracket.match(19);
		expect(secondRoundMatchLB.opponent1?.position).toBe(2);

		const secondRoundSecondMatchLB = bracket.match(20);
		expect(secondRoundSecondMatchLB.opponent1?.position).toBe(1);

		const fourthRoundMatchLB = bracket.match(25);
		expect(fourthRoundMatchLB.opponent1?.position).toBe(2);

		const finalRoundMatchLB = bracket.match(28);
		expect(finalRoundMatchLB.opponent1?.position).toBe(1);
	});
});

describe("Reset match", () => {
	beforeEach(() => {
		bracket.reset();
	});

	test("should reset results of a match", () => {
		// Seeds 1 and 2 are placed into the same first-round match (positions 1
		// and 8) so that match 0 is a real two-team match under the default
		// space_between ordering, while the rest of the bracket is BYEs.
		bracket.create({
			type: "single_elimination",
			seeding: [1, null, null, null, null, null, null, 2],
			settings: {},
		});

		bracket.updateMatch({
			id: 0,
			opponent1: { score: 16 },
			opponent2: { score: 12 },
			winnerSide: "opponent1",
		});

		let match = bracket.match(0);
		expect(match.opponent1?.score).toBe(16);
		expect(match.opponent2?.score).toBe(12);
		expect(match.winnerSide).toBe("opponent1");

		let semi1 = bracket.match(4);
		expect(semi1.winnerSide).toBe("opponent1");
		expect(semi1.opponent2).toBe(null);

		let final = bracket.match(6);
		expect(final.winnerSide).toBe("opponent1");
		expect(final.opponent2).toBe(null);

		bracket.resetMatchResults(0); // Score stays as is.

		match = bracket.match(0);
		expect(match.opponent1?.score).toBe(16);
		expect(match.opponent2?.score).toBe(12);
		expect(match.winnerSide).toBe(null);

		semi1 = bracket.match(4);
		expect(semi1.winnerSide).toBe(null);
		expect(semi1.opponent2).toBe(null);

		final = bracket.match(6);
		expect(final.winnerSide).toBe(null);
		expect(final.opponent2).toBe(null);
	});

	test("should throw when at least one of the following match is locked", () => {
		bracket.create({
			type: "single_elimination",
			seeding: [1, 2, 3, 4],
			settings: {},
		});

		bracket.updateMatch({
			id: 0,
			opponent1: { score: 16 },
			opponent2: { score: 12 },
			winnerSide: "opponent1",
		});

		bracket.updateMatch({
			id: 1,
			opponent1: { score: 16 },
			opponent2: { score: 12 },
			winnerSide: "opponent1",
		});

		bracket.updateMatch({
			id: 2,
			opponent1: { score: 16 },
			opponent2: { score: 12 },
			winnerSide: "opponent1",
		});

		expect(() => bracket.resetMatchResults(0)).toThrow("The match is locked.");
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
			opponent1: { score: 16 },
			opponent2: { score: 12 },
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
			opponent1: { score: 16 },
			opponent2: { score: 12 },
			winnerSide: "opponent1",
		});

		const changedIds = afterReport.changedMatches.map((match) => match.id);
		expect(changedIds).toContain(0); // The reported match.
		expect(changedIds).toContain(2); // The final receiving the winner.
		expect(changedIds).not.toContain(1); // The other semi is untouched.
	});
});
