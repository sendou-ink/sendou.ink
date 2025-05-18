import { beforeEach, describe, expect, test } from "vitest";
import { InMemoryDatabase } from "~/modules/brackets-memory-db";
import { BracketsManager } from "../manager";

const storage = new InMemoryDatabase();
const manager = new BracketsManager(storage);

describe("BYE handling", () => {
	beforeEach(() => {
		storage.reset();
	});

	test("should propagate BYEs through the brackets", () => {
		manager.create({
			name: "Example with BYEs",
			tournamentId: 0,
			type: "double_elimination",
			seeding: [1, null, null, null],
			settings: { seedOrdering: ["natural"], grandFinal: "simple" },
		});

		expect(storage.select<any>("match", 2).opponent1.id).toBe(1);
		expect(storage.select<any>("match", 2).opponent2).toBe(null);

		expect(storage.select<any>("match", 3).opponent1).toBe(null);
		expect(storage.select<any>("match", 3).opponent2).toBe(null);

		expect(storage.select<any>("match", 4).opponent1).toBe(null);
		expect(storage.select<any>("match", 4).opponent2).toBe(null);

		expect(storage.select<any>("match", 5).opponent1.id).toBe(1);
		expect(storage.select<any>("match", 5).opponent2).toBe(null);
	});

	test("should handle incomplete seeding during creation", () => {
		manager.create({
			name: "Example with BYEs",
			tournamentId: 0,
			type: "double_elimination",
			seeding: [1, 2],
			settings: {
				seedOrdering: ["natural"],
				balanceByes: false, // Default value.
				size: 4,
			},
		});

		expect(storage.select<any>("match", 0).opponent1.id).toBe(1);
		expect(storage.select<any>("match", 0).opponent2.id).toBe(2);

		expect(storage.select<any>("match", 1).opponent1).toBe(null);
		expect(storage.select<any>("match", 1).opponent2).toBe(null);
	});

	test("should balance BYEs in the seeding", () => {
		manager.create({
			name: "Example with BYEs",
			tournamentId: 0,
			type: "double_elimination",
			seeding: [1, 2],
			settings: {
				seedOrdering: ["natural"],
				balanceByes: true,
				size: 4,
			},
		});

		expect(storage.select<any>("match", 0).opponent1.id).toBe(1);
		expect(storage.select<any>("match", 0).opponent2).toBe(null);

		expect(storage.select<any>("match", 1).opponent1.id).toBe(2);
		expect(storage.select<any>("match", 1).opponent2).toBe(null);
	});
});

describe("Position checks", () => {
	beforeEach(() => {
		storage.reset();

		manager.create({
			name: "Example with double grand final",
			tournamentId: 0,
			type: "double_elimination",
			settings: {
				size: 8,
				grandFinal: "simple",
				seedOrdering: ["natural"],
			},
		});
	});

	test("should not have a position when we don't need the origin of a participant", () => {
		const matchFromWbRound2 = storage.select<any>("match", 4);
		expect(matchFromWbRound2.opponent1.position).toBe(undefined);
		expect(matchFromWbRound2.opponent2.position).toBe(undefined);

		const matchFromLbRound2 = storage.select<any>("match", 9);
		expect(matchFromLbRound2.opponent2.position).toBe(undefined);

		const matchFromGrandFinal = storage.select<any>("match", 13);
		expect(matchFromGrandFinal.opponent1.position).toBe(undefined);
	});

	test("should have a position where we need the origin of a participant", () => {
		const matchFromWbRound1 = storage.select<any>("match", 0);
		expect(matchFromWbRound1.opponent1.position).toBe(1);
		expect(matchFromWbRound1.opponent2.position).toBe(2);

		const matchFromLbRound1 = storage.select<any>("match", 7);
		expect(matchFromLbRound1.opponent1.position).toBe(1);
		expect(matchFromLbRound1.opponent2.position).toBe(2);

		const matchFromLbRound2 = storage.select<any>("match", 9);
		expect(matchFromLbRound2.opponent1.position).toBe(2);

		const matchFromGrandFinal = storage.select<any>("match", 13);
		expect(matchFromGrandFinal.opponent2.position).toBe(1);
	});
});

describe("Special cases", () => {
	beforeEach(() => {
		storage.reset();
	});

	test("should throw if the name of the stage is not provided", () => {
		expect(() =>
			// @ts-expect-error testing throwing
			manager.create({
				tournamentId: 0,
				type: "single_elimination",
			}),
		).toThrow("You must provide a name for the stage.");
	});

	test("should throw if the tournament id of the stage is not provided", () => {
		expect(() =>
			// @ts-expect-error testing throwing
			manager.create({
				name: "Example",
				type: "single_elimination",
			}),
		).toThrow("You must provide a tournament id for the stage.");
	});

	test("should throw if the participant count of a stage is not a power of two", () => {
		expect(() =>
			manager.create({
				name: "Example",
				tournamentId: 0,
				type: "single_elimination",
				seeding: [1, 2, 3, 4, 5, 6, 7],
			}),
		).toThrow(
			"The library only supports a participant count which is a power of two.",
		);

		expect(() =>
			manager.create({
				name: "Example",
				tournamentId: 0,
				type: "single_elimination",
				settings: { size: 3 },
			}),
		).toThrow(
			"The library only supports a participant count which is a power of two.",
		);
	});

	test("should throw if the participant count of a stage is less than two", () => {
		expect(() =>
			manager.create({
				name: "Example",
				tournamentId: 0,
				type: "single_elimination",
				settings: { size: 0 },
			}),
		).toThrow(
			"Impossible to create an empty stage. If you want an empty seeding, just set the size of the stage.",
		);

		expect(() =>
			manager.create({
				name: "Example",
				tournamentId: 0,
				type: "single_elimination",
				settings: { size: 1 },
			}),
		).toThrow("Impossible to create a stage with less than 2 participants.");
	});
});

describe("Seeding and ordering in elimination", () => {
	beforeEach(() => {
		storage.reset();

		manager.create({
			name: "Amateur",
			tournamentId: 0,
			type: "double_elimination",
			seeding: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16],
			settings: {
				seedOrdering: [
					"inner_outer",
					"reverse",
					"pair_flip",
					"half_shift",
					"reverse",
				],
			},
		});
	});

	test("should have the good orderings everywhere", () => {
		const firstRoundMatchWB = storage.select<any>("match", 0);
		expect(firstRoundMatchWB.opponent1.position).toBe(1);
		expect(firstRoundMatchWB.opponent2.position).toBe(16);

		const firstRoundMatchLB = storage.select<any>("match", 15);
		expect(firstRoundMatchLB.opponent1.position).toBe(8);
		expect(firstRoundMatchLB.opponent2.position).toBe(7);

		const secondRoundMatchLB = storage.select<any>("match", 19);
		expect(secondRoundMatchLB.opponent1.position).toBe(2);

		const secondRoundSecondMatchLB = storage.select<any>("match", 20);
		expect(secondRoundSecondMatchLB.opponent1.position).toBe(1);

		const fourthRoundMatchLB = storage.select<any>("match", 25);
		expect(fourthRoundMatchLB.opponent1.position).toBe(2);

		const finalRoundMatchLB = storage.select<any>("match", 28);
		expect(finalRoundMatchLB.opponent1.position).toBe(1);
	});
});

describe("Reset match and match games", () => {
	beforeEach(() => {
		storage.reset();
	});

	test("should reset results of a match", () => {
		manager.create({
			name: "Example",
			tournamentId: 0,
			type: "single_elimination",
			seeding: [1, 2],
			settings: {
				seedOrdering: ["natural"],
				size: 8,
			},
		});

		manager.update.match({
			id: 0,
			opponent1: { score: 16, result: "win" },
			opponent2: { score: 12 },
		});

		let match = storage.select<any>("match", 0);
		expect(match.opponent1.score).toBe(16);
		expect(match.opponent2.score).toBe(12);
		expect(match.opponent1.result).toBe("win");

		let semi1 = storage.select<any>("match", 4);
		expect(semi1.opponent1.result).toBe("win");
		expect(semi1.opponent2).toBe(null);

		let final = storage.select<any>("match", 6);
		expect(final.opponent1.result).toBe("win");
		expect(final.opponent2).toBe(null);

		manager.reset.matchResults(0); // Score stays as is.

		match = storage.select<any>("match", 0);
		expect(match.opponent1.score).toBe(16);
		expect(match.opponent2.score).toBe(12);
		expect(match.opponent1.result).toBe(undefined);

		semi1 = storage.select<any>("match", 4);
		expect(semi1.opponent1.result).toBe(undefined);
		expect(semi1.opponent2).toBe(null);

		final = storage.select<any>("match", 6);
		expect(final.opponent1.result).toBe(undefined);
		expect(final.opponent2).toBe(null);
	});

	test("should throw when at least one of the following match is locked", () => {
		manager.create({
			name: "Example",
			tournamentId: 0,
			type: "single_elimination",
			seeding: [1, 2, 3, 4],
			settings: {
				seedOrdering: ["natural"],
			},
		});

		manager.update.match({
			id: 0,
			opponent1: { score: 16, result: "win" },
			opponent2: { score: 12 },
		});

		manager.update.match({
			id: 1,
			opponent1: { score: 16, result: "win" },
			opponent2: { score: 12 },
		});

		manager.update.match({
			id: 2,
			opponent1: { score: 16, result: "win" },
			opponent2: { score: 12 },
		});

		expect(() => manager.reset.matchResults(0)).toThrow("The match is locked.");
	});
});

describe("Import / export", () => {
	beforeEach(() => {
		storage.reset();
	});

	test("should import data in the storage", () => {
		manager.create({
			name: "Example",
			tournamentId: 0,
			type: "single_elimination",
			seeding: [1, 2, 3, 4],
			settings: {
				seedOrdering: ["natural"],
			},
		});

		const initialData = manager.get.stageData(0);

		manager.update.match({
			id: 0,
			opponent1: { score: 16, result: "win" },
			opponent2: { score: 12 },
		});

		manager.update.match({
			id: 1,
			opponent1: { score: 16, result: "win" },
			opponent2: { score: 12 },
		});

		manager.update.match({
			id: 2,
			opponent1: { score: 16, result: "win" },
			opponent2: { score: 12 },
		});

		expect(storage.select<any>("match", 0).opponent1.result).toBe("win");
		expect(storage.select<any>("match", 1).opponent1.result).toBe("win");

		manager.import(initialData);

		expect(storage.select<any>("match", 0).opponent1.result).toBe(undefined);
		expect(storage.select<any>("match", 1).opponent1.result).toBe(undefined);
	});

	test("should export data from the storage", () => {
		manager.create({
			name: "Example",
			tournamentId: 0,
			type: "single_elimination",
			seeding: [1, 2, 3, 4],
			settings: {
				seedOrdering: ["natural"],
			},
		});

		const data = manager.export();

		for (const key of ["stage", "group", "round", "match"]) {
			expect(Object.keys(data).includes(key)).toBe(true);
		}

		expect(storage.select<any>("stage")).toEqual(data.stage);
		expect(storage.select<any>("group")).toEqual(data.group);
		expect(storage.select<any>("round")).toEqual(data.round);
		expect(storage.select<any>("match")).toEqual(data.match);
	});
});
