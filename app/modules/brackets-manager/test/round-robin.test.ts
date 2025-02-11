import { beforeEach, describe, expect, test } from "vitest";
import { InMemoryDatabase } from "~/modules/brackets-memory-db";
import { BracketsManager } from "../manager";

const storage = new InMemoryDatabase();
const manager = new BracketsManager(storage);

describe("Create a round-robin stage", () => {
	beforeEach(() => {
		storage.reset();
	});

	test("should create a round-robin stage", () => {
		const example = {
			name: "Example",
			tournamentId: 0,
			type: "round_robin",
			seeding: [1, 2, 3, 4, 5, 6, 7, 8],
			settings: { groupCount: 2 },
		} as any;

		manager.create(example);

		const stage = storage.select<any>("stage", 0)!;
		expect(stage.name).toBe(example.name);
		expect(stage.type).toBe(example.type);

		expect(storage.select("group")!.length).toBe(2);
		expect(storage.select("round")!.length).toBe(6);
		expect(storage.select("match")!.length).toBe(12);
	});

	test("should create a round-robin stage with a manual seeding", () => {
		const example = {
			name: "Example",
			tournamentId: 0,
			type: "round_robin",
			seeding: [1, 2, 3, 4, 5, 6, 7, 8],
			settings: {
				groupCount: 2,
				manualOrdering: [
					[1, 4, 6, 7],
					[2, 3, 5, 8],
				],
			},
		} as any;

		manager.create(example);

		for (let groupIndex = 0; groupIndex < 2; groupIndex++) {
			const matches = storage.select<any>("match", { group_id: groupIndex })!;
			const participants = [
				matches[0].opponent1.position,
				matches[1].opponent2.position,
				matches[1].opponent1.position,
				matches[0].opponent2.position,
			];

			expect(participants).toEqual(example.settings.manualOrdering[groupIndex]);
		}
	});

	test("should throw if manual ordering has invalid counts", () => {
		expect(() =>
			manager.create({
				name: "Example",
				tournamentId: 0,
				type: "round_robin",
				seeding: [1, 2, 3, 4, 5, 6, 7, 8],
				settings: {
					groupCount: 2,
					manualOrdering: [[1, 4, 6, 7]],
				},
			}),
		).toThrow(
			"Group count in the manual ordering does not correspond to the given group count.",
		);

		expect(() =>
			manager.create({
				name: "Example",
				tournamentId: 0,
				type: "round_robin",
				seeding: [1, 2, 3, 4, 5, 6, 7, 8],
				settings: {
					groupCount: 2,
					manualOrdering: [
						[1, 4],
						[2, 3],
					],
				},
			}),
		).toThrow("Not enough seeds in at least one group of the manual ordering.");
	});

	test("should create a round-robin stage without BYE vs. BYE matches", () => {
		const example = {
			name: "Example",
			tournamentId: 0,
			type: "round_robin",
			seeding: [1, 2, 3, 4, 5, null, null, null],
			settings: { groupCount: 2 },
		} as any;

		manager.create(example);

		// One match must be missing.
		expect(storage.select("match")!.length).toBe(11);
	});

	test("should create a round-robin stage with to be determined participants", () => {
		manager.create({
			name: "Example",
			tournamentId: 0,
			type: "round_robin",
			settings: {
				groupCount: 4,
				size: 16,
			},
		});

		expect(storage.select("group")!.length).toBe(4);
		expect(storage.select("round")!.length).toBe(4 * 3);
		expect(storage.select("match")!.length).toBe(4 * 3 * 2);
	});

	test("should create a round-robin stage with effort balanced", () => {
		manager.create({
			name: "Example with effort balanced",
			tournamentId: 0,
			type: "round_robin",
			seeding: [1, 2, 3, 4, 5, 6, 7, 8],
			settings: {
				groupCount: 2,
				seedOrdering: ["groups.seed_optimized"],
			},
		});

		expect(storage.select<any>("match", 0).opponent1.id).toBe(1);
		expect(storage.select<any>("match", 0).opponent2.id).toBe(8);
	});

	test("should throw if no group count given", () => {
		expect(() =>
			manager.create({
				name: "Example",
				tournamentId: 0,
				type: "round_robin",
			}),
		).toThrow("You must specify a group count for round-robin stages.");
	});

	test("should throw if the group count is not strictly positive", () => {
		expect(() =>
			manager.create({
				name: "Example",
				tournamentId: 0,
				type: "round_robin",
				settings: {
					groupCount: 0,
					size: 4,
					seedOrdering: ["groups.seed_optimized"],
				},
			}),
		).toThrow("You must provide a strictly positive group count.");
	});
});

describe("Update scores in a round-robin stage", () => {
	beforeEach(() => {
		storage.reset();
		manager.create({
			name: "Example scores",
			tournamentId: 0,
			type: "round_robin",
			seeding: [1, 2, 3, 4],
			settings: { groupCount: 1 },
		});
	});

	describe("Example use-case", () => {
		beforeEach(() => {
			storage.reset();
			manager.create({
				name: "Example scores",
				tournamentId: 0,
				type: "round_robin",
				seeding: [1, 2, 3, 4],
				settings: { groupCount: 1 },
			});
		});

		test("should set all the scores", () => {
			manager.update.match({
				id: 0,
				opponent1: { score: 16, result: "win" }, // POCEBLO
				opponent2: { score: 9 }, // AQUELLEHEURE?!
			});

			manager.update.match({
				id: 1,
				opponent1: { score: 3 }, // Ballec Squad
				opponent2: { score: 16, result: "win" }, // twitch.tv/mrs_fly
			});

			manager.update.match({
				id: 2,
				opponent1: { score: 16, result: "win" }, // twitch.tv/mrs_fly
				opponent2: { score: 0 }, // AQUELLEHEURE?!
			});

			manager.update.match({
				id: 3,
				opponent1: { score: 16, result: "win" }, // POCEBLO
				opponent2: { score: 2 }, // Ballec Squad
			});

			manager.update.match({
				id: 4,
				opponent1: { score: 16, result: "win" }, // Ballec Squad
				opponent2: { score: 12 }, // AQUELLEHEURE?!
			});

			manager.update.match({
				id: 5,
				opponent1: { score: 4 }, // twitch.tv/mrs_fly
				opponent2: { score: 16, result: "win" }, // POCEBLO
			});
		});
	});
});
