import { describe, expect, test } from "vitest";
import { InMemoryDatabase } from "~/modules/brackets-memory-db";
import { BracketsManager } from "../manager";

const storage = new InMemoryDatabase();
const manager = new BracketsManager(storage);

describe("Get seeding", () => {
	test("should get the seeding of a round-robin stage", () => {
		storage.reset();

		manager.create({
			name: "Example",
			tournamentId: 0,
			type: "round_robin",
			settings: {
				groupCount: 8,
				size: 32,
				seedOrdering: ["groups.seed_optimized"],
			},
		});

		const seeding = manager.get.seeding(0);
		expect(seeding.length).toBe(32);
		expect(seeding[0]!.position).toBe(1);
		expect(seeding[1]!.position).toBe(2);
	});

	test("should get the seeding of a round-robin stage with BYEs", () => {
		storage.reset();

		manager.create({
			name: "Example",
			tournamentId: 0,
			type: "round_robin",
			settings: {
				groupCount: 2,
				size: 8,
			},
			seeding: [1, null, null, null, null, null, null, null],
		});

		const seeding = manager.get.seeding(0);
		expect(seeding.length).toBe(8);
	});

	test("should get the seeding of a single elimination stage", () => {
		storage.reset();

		manager.create({
			name: "Example",
			tournamentId: 0,
			type: "single_elimination",
			settings: { size: 16 },
		});

		const seeding = manager.get.seeding(0);
		expect(seeding.length).toBe(16);
		expect(seeding[0]!.position).toBe(1);
		expect(seeding[1]!.position).toBe(2);
	});

	test("should get the seeding with BYEs", () => {
		storage.reset();

		manager.create({
			name: "Example",
			tournamentId: 0,
			type: "single_elimination",
			seeding: [1, null, 2, 3, 4, null, null, 5],
			settings: {
				seedOrdering: ["inner_outer"],
			},
		});

		const seeding = manager.get.seeding(0);
		expect(seeding.length).toBe(8);
		expect(seeding).toEqual([
			{ id: 1, position: 1 },
			null,
			{ id: 2, position: 3 },
			{ id: 3, position: 4 },
			{ id: 4, position: 5 },
			null,
			null,
			{ id: 5, position: 8 },
		]);
	});
});
