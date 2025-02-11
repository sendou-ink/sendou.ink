import { beforeEach, describe, expect, test } from "vitest";
import { InMemoryDatabase } from "~/modules/brackets-memory-db";
import { BracketsManager } from "../manager";

const storage = new InMemoryDatabase();
const manager = new BracketsManager(storage);

describe("Find previous and next matches in single elimination", () => {
	beforeEach(() => {
		storage.reset();
	});

	test("should find previous matches", () => {
		manager.create({
			name: "Example",
			tournamentId: 0,
			type: "single_elimination",
			seeding: [1, 2, 3, 4, 5, 6, 7, 8],
		});

		const beforeFirst = manager.find.previousMatches(0);
		expect(beforeFirst.length).toBe(0);

		const beforeSemi1 = manager.find.previousMatches(4);
		expect(beforeSemi1.length).toBe(2);
		expect(beforeSemi1[0].id).toBe(0);
		expect(beforeSemi1[1].id).toBe(1);

		const beforeSemi2 = manager.find.previousMatches(5);
		expect(beforeSemi2.length).toBe(2);
		expect(beforeSemi2[0].id).toBe(2);
		expect(beforeSemi2[1].id).toBe(3);

		const beforeFinal = manager.find.previousMatches(6);
		expect(beforeFinal.length).toBe(2);
		expect(beforeFinal[0].id).toBe(4);
		expect(beforeFinal[1].id).toBe(5);
	});

	test("should find next matches", () => {
		manager.create({
			name: "Example",
			tournamentId: 0,
			type: "single_elimination",
			seeding: [1, 2, 3, 4, 5, 6, 7, 8],
		});

		const afterFirst = manager.find.nextMatches(0);
		expect(afterFirst.length).toBe(1);
		expect(afterFirst[0].id).toBe(4);

		const afterSemi1 = manager.find.nextMatches(4);
		expect(afterSemi1.length).toBe(1);
		expect(afterSemi1[0].id).toBe(6);

		const afterFinal = manager.find.nextMatches(6);
		expect(afterFinal.length).toBe(0);
	});

	test("should return matches from the point of view of a participant", () => {
		manager.create({
			name: "Example",
			tournamentId: 0,
			type: "single_elimination",
			seeding: [1, 2, 3, 4, 5, 6, 7, 8],
			settings: {
				seedOrdering: ["natural"],
			},
		});

		manager.update.match({ id: 0, opponent1: { result: "loss" } });
		const afterFirstEliminated = manager.find.nextMatches(0, 1);
		expect(afterFirstEliminated.length).toBe(0);
		const afterFirstContinued = manager.find.nextMatches(0, 2);
		expect(afterFirstContinued.length).toBe(1);

		manager.update.match({ id: 1, opponent1: { result: "win" } });
		const beforeSemi1Up = manager.find.previousMatches(4, 2);
		expect(beforeSemi1Up.length).toBe(1);
		expect(beforeSemi1Up[0].id).toBe(0);

		const beforeSemi1Down = manager.find.previousMatches(4, 3);
		expect(beforeSemi1Down.length).toBe(1);
		expect(beforeSemi1Down[0].id).toBe(1);
	});
});

describe("Find previous and next matches in double elimination", () => {
	beforeEach(() => {
		storage.reset();
	});

	test("should find previous matches", () => {
		manager.create({
			name: "Example",
			tournamentId: 0,
			type: "double_elimination",
			seeding: [1, 2, 3, 4, 5, 6, 7, 8],
		});

		const beforeFirstWB = manager.find.previousMatches(0);
		expect(beforeFirstWB.length).toBe(0);

		const beforeSemi1WB = manager.find.previousMatches(4);
		expect(beforeSemi1WB.length).toBe(2);
		expect(beforeSemi1WB[0].id).toBe(0);
		expect(beforeSemi1WB[1].id).toBe(1);

		const beforeSemi2WB = manager.find.previousMatches(5);
		expect(beforeSemi2WB.length).toBe(2);
		expect(beforeSemi2WB[0].id).toBe(2);
		expect(beforeSemi2WB[1].id).toBe(3);

		const beforeFinalWB = manager.find.previousMatches(6);
		expect(beforeFinalWB.length).toBe(2);
		expect(beforeFinalWB[0].id).toBe(4);
		expect(beforeFinalWB[1].id).toBe(5);

		const beforeFirstRound1LB = manager.find.previousMatches(7);
		expect(beforeFirstRound1LB.length).toBe(2);
		expect(beforeFirstRound1LB[0].id).toBe(0);
		expect(beforeFirstRound1LB[1].id).toBe(1);

		const beforeFirstRound2LB = manager.find.previousMatches(9);
		expect(beforeFirstRound2LB.length).toBe(2);
		expect(beforeFirstRound2LB[0].id).toBe(5);
		expect(beforeFirstRound2LB[1].id).toBe(7);

		const beforeSemi1LB = manager.find.previousMatches(11);
		expect(beforeSemi1LB.length).toBe(2);
		expect(beforeSemi1LB[0].id).toBe(9);
		expect(beforeSemi1LB[1].id).toBe(10);

		const beforeFinalLB = manager.find.previousMatches(12);
		expect(beforeFinalLB.length).toBe(2);
		expect(beforeFinalLB[0].id).toBe(6);
		expect(beforeFinalLB[1].id).toBe(11);
	});

	test("should find next matches", () => {
		manager.create({
			name: "Example",
			tournamentId: 0,
			type: "double_elimination",
			seeding: [1, 2, 3, 4, 5, 6, 7, 8],
		});

		const afterFirstWB = manager.find.nextMatches(0);
		expect(afterFirstWB.length).toBe(2);
		expect(afterFirstWB[0].id).toBe(4);
		expect(afterFirstWB[1].id).toBe(7);

		const afterSemi1WB = manager.find.nextMatches(4);
		expect(afterSemi1WB.length).toBe(2);
		expect(afterSemi1WB[0].id).toBe(6);
		expect(afterSemi1WB[1].id).toBe(10);

		const afterFinalWB = manager.find.nextMatches(6);
		expect(afterFinalWB.length).toBe(1);
		expect(afterFinalWB[0].id).toBe(12);

		const afterFirstRound1LB = manager.find.nextMatches(7);
		expect(afterFirstRound1LB.length).toBe(1);
		expect(afterFirstRound1LB[0].id).toBe(9);

		const afterFirstRound2LB = manager.find.nextMatches(9);
		expect(afterFirstRound2LB.length).toBe(1);
		expect(afterFirstRound2LB[0].id).toBe(11);

		const afterSemi1LB = manager.find.nextMatches(11);
		expect(afterSemi1LB.length).toBe(1);
		expect(afterSemi1LB[0].id).toBe(12);

		const afterFinalLB = manager.find.nextMatches(12);
		expect(afterFinalLB.length).toBe(0);
	});

	test("should return matches from the point of view of a participant", () => {
		manager.create({
			name: "Example",
			tournamentId: 0,
			type: "double_elimination",
			seeding: [1, 2, 3, 4],
			settings: {
				seedOrdering: ["natural"],
			},
		});

		manager.update.match({ id: 0, opponent1: { result: "loss" } });
		const afterFirstEliminated = manager.find.nextMatches(0, 1);
		expect(afterFirstEliminated.length).toBe(1);
		expect(afterFirstEliminated[0].id).toBe(3);
		const afterFirstContinued = manager.find.nextMatches(0, 2);
		expect(afterFirstContinued.length).toBe(1);
		expect(afterFirstContinued[0].id).toBe(2);

		manager.update.match({ id: 1, opponent1: { result: "win" } });
		const beforeSemi1Up = manager.find.previousMatches(2, 2);
		expect(beforeSemi1Up.length).toBe(1);
		expect(beforeSemi1Up[0].id).toBe(0);

		const beforeSemi1Down = manager.find.previousMatches(2, 3);
		expect(beforeSemi1Down.length).toBe(1);
		expect(beforeSemi1Down[0].id).toBe(1);

		manager.update.match({ id: 3, opponent1: { result: "loss" } });
		const afterLowerBracketEliminated = manager.find.nextMatches(3, 1);
		expect(afterLowerBracketEliminated.length).toBe(0);
		const afterLowerBracketContinued = manager.find.nextMatches(3, 4);
		expect(afterLowerBracketContinued.length).toBe(1);
		expect(afterLowerBracketContinued[0].id).toBe(4);

		expect(() => manager.find.nextMatches(3, 42)).toThrow(
			"The participant does not belong to this match.",
		);
	});
});
