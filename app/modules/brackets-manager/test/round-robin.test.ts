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

	test("should unlock next round matches as soon as both participants are ready", () => {
		// Round robin with 4 teams: [1, 2, 3, 4]
		// Round 1: Match 0 (1 vs 2), Match 1 (3 vs 4)
		// Round 2: Match 2 (1 vs 3), Match 3 (2 vs 4)
		// Round 3: Match 4 (1 vs 4), Match 5 (2 vs 3)

		const round1Match1 = storage.select<any>("match", 0)!;
		const round1Match2 = storage.select<any>("match", 1)!;
		const round2Match1 = storage.select<any>("match", 2)!;
		const round2Match2 = storage.select<any>("match", 3)!;

		// Initially, only round 1 matches should be ready
		expect(round1Match1.status).toBe(2); // Ready (1 vs 2)
		expect(round1Match2.status).toBe(2); // Ready (3 vs 4)
		expect(round2Match1.status).toBe(0); // Locked (1 vs 3)
		expect(round2Match2.status).toBe(0); // Locked (2 vs 4)

		// Complete first match of round 1 (1 vs 2)
		manager.update.match({
			id: 0,
			opponent1: { score: 16, result: "win" }, // Team 1 wins
			opponent2: { score: 9 }, // Team 2 loses
		});

		// Round 2 Match 1 (1 vs 3) should still be locked because team 3 hasn't finished
		// Round 2 Match 2 (2 vs 4) should still be locked because team 4 hasn't finished
		let round2Match1After = storage.select<any>("match", 2)!;
		let round2Match2After = storage.select<any>("match", 3)!;
		expect(round2Match1After.status).toBe(0); // Still Locked
		expect(round2Match2After.status).toBe(0); // Still Locked

		// Complete second match of round 1 (3 vs 4)
		manager.update.match({
			id: 1,
			opponent1: { score: 3 }, // Team 3 loses
			opponent2: { score: 16, result: "win" }, // Team 4 wins
		});

		// Now both matches in round 2 should be unlocked
		// Match 2 (1 vs 3): both team 1 and team 3 have finished round 1
		// Match 3 (2 vs 4): both team 2 and team 4 have finished round 1
		round2Match1After = storage.select<any>("match", 2)!;
		round2Match2After = storage.select<any>("match", 3)!;
		expect(round2Match1After.status).toBe(2); // Ready
		expect(round2Match2After.status).toBe(2); // Ready
	});

	test("should unlock next round matches with BYE participants", () => {
		storage.reset();
		// Create a round robin with 3 teams (odd number creates rounds where one team doesn't play)
		manager.create({
			name: "Example with BYEs",
			tournamentId: 0,
			type: "round_robin",
			seeding: [1, 2, 3],
			settings: { groupCount: 1 },
		});

		// With 3 teams, the rounds look like:
		// Round 1: Match (teams 3 vs 2) - Team 1 doesn't play
		// Round 2: Match (teams 1 vs 3) - Team 2 doesn't play
		// Round 3: Match (teams 2 vs 1) - Team 3 doesn't play

		const allMatches = storage.select<any>("match")!;
		const allRounds = storage.select<any>("round")!;

		// Find the actual match (not BYE vs BYE which doesn't exist)
		const round1RealMatch = allMatches.find(
			(m: any) => m.round_id === allRounds[0].id && m.opponent1 && m.opponent2,
		)!;
		const round2RealMatch = allMatches.find(
			(m: any) => m.round_id === allRounds[1].id && m.opponent1 && m.opponent2,
		)!;

		expect(round1RealMatch.status).toBe(2); // Ready
		expect(round2RealMatch.status).toBe(0); // Locked initially

		// Complete the only real match in round 1 (teams 3 vs 2)
		// Team 1 didn't play in round 1
		manager.update.match({
			id: round1RealMatch.id,
			opponent1: { score: 16, result: "win" },
			opponent2: { score: 9 },
		});

		// The real match in round 2 (teams 1 vs 3) should now be unlocked
		// because team 1 didn't play in round 1 (considered ready)
		// and team 3 just finished their match
		const round2AfterUpdate = storage.select<any>("match", round2RealMatch.id)!;
		expect(round2AfterUpdate.status).toBe(2); // Ready
	});
});
