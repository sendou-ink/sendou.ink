import { beforeEach, describe, expect, test } from "vitest";
import { InMemoryDatabase } from "~/modules/brackets-memory-db";
import { BracketsManager } from "../manager";

const storage = new InMemoryDatabase();
const manager = new BracketsManager(storage);

describe("Delete stage", () => {
	beforeEach(() => {
		storage.reset();
	});

	test("should delete a stage and all its linked data", () => {
		manager.create({
			name: "Example",
			tournamentId: 0,
			type: "single_elimination",
			seeding: [1, 2, 3, 4],
		});

		manager.delete.stage(0);

		const stages = storage.select("stage")!;
		const groups = storage.select("group")!;
		const rounds = storage.select("round")!;
		const matches = storage.select<any>("match")!;

		expect(stages.length).toBe(0);
		expect(groups.length).toBe(0);
		expect(rounds.length).toBe(0);
		expect(matches.length).toBe(0);
	});

	test("should delete one stage and only its linked data", () => {
		manager.create({
			name: "Example 1",
			tournamentId: 0,
			type: "single_elimination",
			seeding: [1, 2, 3, 4],
		});

		manager.create({
			name: "Example 2",
			tournamentId: 0,
			type: "single_elimination",
			seeding: [1, 2, 3, 4],
		});

		manager.delete.stage(0);

		const stages = storage.select<any>("stage")!;
		const groups = storage.select<any>("group")!;
		const rounds = storage.select<any>("round")!;
		const matches = storage.select<any>("match")!;

		expect(stages.length).toBe(1);
		expect(groups.length).toBe(1);
		expect(rounds.length).toBe(2);
		expect(matches.length).toBe(3);

		// Remaining data
		expect(stages[0].id).toBe(1);
		expect(groups[0].id).toBe(1);
		expect(rounds[0].id).toBe(2);
		expect(matches[0].id).toBe(3);
	});

	test("should delete all stages of the tournament", () => {
		manager.create({
			name: "Example 1",
			tournamentId: 0,
			type: "single_elimination",
			seeding: [1, 2, 3, 4],
		});

		manager.create({
			name: "Example 2",
			tournamentId: 0,
			type: "single_elimination",
			seeding: [1, 2, 3, 4],
		});

		manager.delete.tournament(0);

		const stages = storage.select("stage")!;
		const groups = storage.select("group")!;
		const rounds = storage.select("round")!;
		const matches = storage.select<any>("match")!;

		expect(stages.length).toBe(0);
		expect(groups.length).toBe(0);
		expect(rounds.length).toBe(0);
		expect(matches.length).toBe(0);
	});
});
