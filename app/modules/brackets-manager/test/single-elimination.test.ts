import { beforeEach, describe, expect, test } from "vitest";
import { Status } from "~/db/types";
import { InMemoryDatabase } from "~/modules/brackets-memory-db";
import { BracketsManager } from "../manager";

const storage = new InMemoryDatabase();
const manager = new BracketsManager(storage);

describe("Create single elimination stage", () => {
	beforeEach(() => {
		storage.reset();
	});

	test("should create a single elimination stage", () => {
		const example = {
			name: "Example",
			tournamentId: 0,
			type: "single_elimination",
			seeding: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16],
			settings: { seedOrdering: ["natural"] },
		} as any;

		manager.create(example);

		const stage = storage.select<any>("stage", 0);
		expect(stage.name).toBe(example.name);
		expect(stage.type).toBe(example.type);

		expect(storage.select<any>("group")!.length).toBe(1);
		expect(storage.select<any>("round")!.length).toBe(4);
		expect(storage.select<any>("match")!.length).toBe(15);
	});

	test("should create a single elimination stage with BYEs", () => {
		manager.create({
			name: "Example with BYEs",
			tournamentId: 0,
			type: "single_elimination",
			seeding: [1, null, 3, 4, null, null, 7, 8],
			settings: { seedOrdering: ["natural"] },
		});

		expect(storage.select<any>("match", 4).opponent1.id).toBe(1);
		expect(storage.select<any>("match", 4).opponent2.id).toBe(null);
		expect(storage.select<any>("match", 5).opponent1).toBe(null);
		expect(storage.select<any>("match", 5).opponent2.id).toBe(null);
	});

	test("should create a single elimination stage with consolation final", () => {
		manager.create({
			name: "Example with consolation final",
			tournamentId: 0,
			type: "single_elimination",
			seeding: [1, 2, 3, 4, 5, 6, 7, 8],
			settings: { consolationFinal: true, seedOrdering: ["natural"] },
		});

		expect(storage.select<any>("group")!.length).toBe(2);
		expect(storage.select<any>("round")!.length).toBe(4);
		expect(storage.select<any>("match")!.length).toBe(8);
	});

	test("should create a single elimination stage with consolation final and BYEs", () => {
		manager.create({
			name: "Example with consolation final and BYEs",
			tournamentId: 0,
			type: "single_elimination",
			seeding: [null, null, null, 4, 5, 6, 7, 8],
			settings: { consolationFinal: true, seedOrdering: ["natural"] },
		});

		expect(storage.select<any>("match", 4).opponent1).toBe(null);
		expect(storage.select<any>("match", 4).opponent2.id).toBe(4);

		// Consolation final
		expect(storage.select<any>("match", 7).opponent1).toBe(null);
		expect(storage.select<any>("match", 7).opponent2.id).toBe(null);
	});

	test("should create a single elimination stage with Bo3 matches", () => {
		manager.create({
			name: "Example with Bo3 matches",
			tournamentId: 0,
			type: "single_elimination",
			seeding: [1, 2, 3, 4, 5, 6, 7, 8],
			settings: { seedOrdering: ["natural"] },
		});

		expect(storage.select<any>("group")!.length).toBe(1);
		expect(storage.select<any>("round")!.length).toBe(3);
		expect(storage.select<any>("match")!.length).toBe(7);
	});

	test("should determine the number property of created stages", () => {
		manager.create({
			name: "Stage 1",
			tournamentId: 0,
			type: "single_elimination",
			settings: { size: 2 },
		});

		expect(storage.select<any>("stage", 0).number).toBe(1);

		manager.create({
			name: "Stage 2",
			tournamentId: 0,
			type: "single_elimination",
			settings: { size: 2 },
		});

		expect(storage.select<any>("stage", 1).number).toBe(2);

		manager.delete.stage(0);

		manager.create({
			name: "Stage 3",
			tournamentId: 0,
			type: "single_elimination",
			settings: { size: 2 },
		});

		expect(storage.select<any>("stage", 2).number).toBe(3);
	});

	test("should create a stage with the given number property", () => {
		manager.create({
			name: "Stage 1",
			tournamentId: 0,
			type: "single_elimination",
			settings: { size: 2 },
		});

		manager.create({
			name: "Stage 2",
			tournamentId: 0,
			type: "single_elimination",
			settings: { size: 2 },
		});

		manager.delete.stage(0);

		manager.create({
			name: "Stage 1 (new)",
			tournamentId: 0,
			type: "single_elimination",
			number: 1,
			settings: { size: 2 },
		});

		expect(storage.select<any>("stage", 2).number).toBe(1);
	});

	test("should throw if the given number property already exists", () => {
		manager.create({
			name: "Stage 1",
			tournamentId: 0,
			type: "single_elimination",
			number: 1,
			settings: { size: 2 },
		});

		expect(() =>
			manager.create({
				name: "Stage 1",
				tournamentId: 0,
				type: "single_elimination",
				number: 1, // Duplicate
				settings: { size: 2 },
			}),
		).toThrow("The given stage number already exists.");
	});

	test("should throw if the seeding has duplicate participants", () => {
		expect(() =>
			manager.create({
				name: "Example",
				tournamentId: 0,
				type: "single_elimination",
				seeding: [
					1,
					1, // Duplicate
					3,
					4,
				],
			}),
		).toThrow("The seeding has a duplicate participant.");
	});
});

describe("Previous and next match update", () => {
	beforeEach(() => {
		storage.reset();
	});

	test("should determine matches in consolation final", () => {
		manager.create({
			name: "Example",
			tournamentId: 0,
			type: "single_elimination",
			seeding: [1, 2, 3, 4],
			settings: { consolationFinal: true },
		});

		manager.update.match({
			id: 0, // First match of round 1
			opponent1: { score: 16, result: "win" },
			opponent2: { score: 12 },
		});

		manager.update.match({
			id: 1, // Second match of round 1
			opponent1: { score: 13 },
			opponent2: { score: 16, result: "win" },
		});

		expect(storage.select<any>("match", 3).opponent1.id).toBe(
			storage.select<any>("match", 0).opponent2.id,
		);
		expect(storage.select<any>("match", 3).opponent2.id).toBe(
			storage.select<any>("match", 1).opponent1.id,
		);
		expect(storage.select<any>("match", 2).status).toBe(Status.Ready);
		expect(storage.select<any>("match", 3).status).toBe(Status.Ready);
	});

	test("should play both the final and consolation final in parallel", () => {
		manager.create({
			name: "Example",
			tournamentId: 0,
			type: "single_elimination",
			seeding: [1, 2, 3, 4],
			settings: { consolationFinal: true },
		});

		manager.update.match({
			id: 0, // First match of round 1
			opponent1: { score: 16, result: "win" },
			opponent2: { score: 12 },
		});

		manager.update.match({
			id: 1, // Second match of round 1
			opponent1: { score: 13 },
			opponent2: { score: 16, result: "win" },
		});

		manager.update.match({
			id: 2, // Final
			opponent1: { score: 12 },
			opponent2: { score: 9 },
		});

		expect(storage.select<any>("match", 2).status).toBe(Status.Running);
		expect(storage.select<any>("match", 3).status).toBe(Status.Ready);

		manager.update.match({
			id: 3, // Consolation final
			opponent1: { score: 12 },
			opponent2: { score: 9 },
		});

		expect(storage.select<any>("match", 2).status).toBe(Status.Running);
		expect(storage.select<any>("match", 3).status).toBe(Status.Running);

		manager.update.match({
			id: 3, // Consolation final
			opponent1: { score: 16, result: "win" },
			opponent2: { score: 9 },
		});

		expect(storage.select<any>("match", 2).status).toBe(Status.Running);

		manager.update.match({
			id: 2, // Final
			opponent1: { score: 16, result: "win" },
			opponent2: { score: 9 },
		});
	});
});
