import { beforeEach, describe, expect, test } from "vitest";
import { EngineBracket } from "../test-utils";

const bracket = new EngineBracket();

describe("Update scores in a round-robin stage", () => {
	beforeEach(() => {
		bracket.reset();
		bracket.create({
			name: "Example scores",
			tournamentId: 0,
			type: "round_robin",
			seeding: [1, 2, 3, 4],
			settings: { groupCount: 1 },
		});
	});

	test("should set all the scores", () => {
		bracket.updateMatch({
			id: 0,
			opponent1: { score: 16, result: "win" }, // POCEBLO
			opponent2: { score: 9 }, // AQUELLEHEURE?!
		});

		bracket.updateMatch({
			id: 1,
			opponent1: { score: 3 }, // Ballec Squad
			opponent2: { score: 16, result: "win" }, // twitch.tv/mrs_fly
		});

		bracket.updateMatch({
			id: 2,
			opponent1: { score: 16, result: "win" }, // twitch.tv/mrs_fly
			opponent2: { score: 0 }, // AQUELLEHEURE?!
		});

		bracket.updateMatch({
			id: 3,
			opponent1: { score: 16, result: "win" }, // POCEBLO
			opponent2: { score: 2 }, // Ballec Squad
		});

		bracket.updateMatch({
			id: 4,
			opponent1: { score: 16, result: "win" }, // Ballec Squad
			opponent2: { score: 12 }, // AQUELLEHEURE?!
		});

		bracket.updateMatch({
			id: 5,
			opponent1: { score: 4 }, // twitch.tv/mrs_fly
			opponent2: { score: 16, result: "win" }, // POCEBLO
		});
	});

	test("should unlock next round matches as soon as both participants are ready", () => {
		// Round robin with 4 teams: [1, 2, 3, 4]
		// Round 1: Match 0 (1 vs 2), Match 1 (3 vs 4)
		// Round 2: Match 2 (1 vs 3), Match 3 (2 vs 4)
		// Round 3: Match 4 (1 vs 4), Match 5 (2 vs 3)

		// Initially, only round 1 matches should be ready
		expect(bracket.match(0).status).toBe(2); // Ready (1 vs 2)
		expect(bracket.match(1).status).toBe(2); // Ready (3 vs 4)
		expect(bracket.match(2).status).toBe(0); // Locked (1 vs 3)
		expect(bracket.match(3).status).toBe(0); // Locked (2 vs 4)

		// Complete first match of round 1 (1 vs 2)
		bracket.updateMatch({
			id: 0,
			opponent1: { score: 16, result: "win" }, // Team 1 wins
			opponent2: { score: 9 }, // Team 2 loses
		});

		// Round 2 Match 1 (1 vs 3) should still be locked because team 3 hasn't finished
		// Round 2 Match 2 (2 vs 4) should still be locked because team 4 hasn't finished
		expect(bracket.match(2).status).toBe(0); // Still Locked
		expect(bracket.match(3).status).toBe(0); // Still Locked

		// Complete second match of round 1 (3 vs 4)
		bracket.updateMatch({
			id: 1,
			opponent1: { score: 3 }, // Team 3 loses
			opponent2: { score: 16, result: "win" }, // Team 4 wins
		});

		// Now both matches in round 2 should be unlocked
		// Match 2 (1 vs 3): both team 1 and team 3 have finished round 1
		// Match 3 (2 vs 4): both team 2 and team 4 have finished round 1
		expect(bracket.match(2).status).toBe(2); // Ready
		expect(bracket.match(3).status).toBe(2); // Ready
	});

	test("should leave every match Ready when independentRounds is set", () => {
		bracket.reset();
		bracket.create({
			name: "Independent rounds",
			tournamentId: 0,
			type: "round_robin",
			seeding: [1, 2, 3, 4],
			settings: { groupCount: 1, independentRounds: true },
		});

		for (const match of bracket.matches()) {
			expect(match.status).toBe(2);
		}

		// reporting a round-2 match before round-1 finishes must not throw
		const round2Match = bracket.match(2);
		expect(() =>
			bracket.updateMatch({
				id: round2Match.id,
				opponent1: { score: 16, result: "win" },
				opponent2: { score: 4 },
			}),
		).not.toThrow();
	});

	test("should let the only real match be played in a group with fewer teams than slots", () => {
		bracket.reset();
		// Group sized for 3 but only 2 teams placed (the 3rd slot is a BYE).
		// The two real teams only meet in round 3, preceded by two BYE rounds
		// that can never be reported. The real match must still be playable.
		bracket.create({
			name: "Two teams in a three-slot group",
			tournamentId: 0,
			type: "round_robin",
			seeding: [1, 2, null],
			settings: { groupCount: 1 },
		});

		const realMatch = bracket
			.matches()
			.find((m) => m.opponent1?.id && m.opponent2?.id)!;

		expect(realMatch.status).toBe(2); // Ready

		expect(() =>
			bracket.updateMatch({
				id: realMatch.id,
				opponent1: { score: 16, result: "win" },
				opponent2: { score: 9 },
			}),
		).not.toThrow();
	});

	test("should unlock next round matches with BYE participants", () => {
		bracket.reset();
		// Create a round robin with 3 teams (odd number creates rounds where one team doesn't play)
		bracket.create({
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

		const allMatches = bracket.matches();
		const allRounds = bracket.rounds();

		// Find the actual match (not BYE vs BYE which doesn't exist)
		const round1RealMatch = allMatches.find(
			(m) => m.round_id === allRounds[0].id && m.opponent1 && m.opponent2,
		)!;
		const round2RealMatch = allMatches.find(
			(m) => m.round_id === allRounds[1].id && m.opponent1 && m.opponent2,
		)!;

		expect(round1RealMatch.status).toBe(2); // Ready
		expect(round2RealMatch.status).toBe(0); // Locked initially

		// Complete the only real match in round 1 (teams 3 vs 2)
		// Team 1 didn't play in round 1
		bracket.updateMatch({
			id: round1RealMatch.id,
			opponent1: { score: 16, result: "win" },
			opponent2: { score: 9 },
		});

		// The real match in round 2 (teams 1 vs 3) should now be unlocked
		// because team 1 didn't play in round 1 (considered ready)
		// and team 3 just finished their match
		expect(bracket.match(round2RealMatch.id).status).toBe(2); // Ready
	});
});
