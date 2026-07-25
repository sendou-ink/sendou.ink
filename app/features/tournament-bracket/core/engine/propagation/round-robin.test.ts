import { beforeEach, describe, expect, test } from "vitest";
import { EngineBracket } from "../test-utils";

const bracket = new EngineBracket();

describe("Update scores in a round-robin stage", () => {
	beforeEach(() => {
		bracket.reset();
		bracket.create({
			type: "round_robin",
			seeding: [1, 2, 3, 4],
			settings: { groupCount: 1 },
		});
	});

	test("should set all the scores", () => {
		bracket.updateMatch({
			id: 0,
			opponent1: { score: 16 },
			opponent2: { score: 9 }, // AQUELLEHEURE?!
			winnerSide: "opponent1", // POCEBLO
		});

		bracket.updateMatch({
			id: 1,
			opponent1: { score: 3 }, // Ballec Squad
			opponent2: { score: 16 },
			winnerSide: "opponent2", // twitch.tv/mrs_fly
		});

		bracket.updateMatch({
			id: 2,
			opponent1: { score: 16 },
			opponent2: { score: 0 }, // AQUELLEHEURE?!
			winnerSide: "opponent1", // twitch.tv/mrs_fly
		});

		bracket.updateMatch({
			id: 3,
			opponent1: { score: 16 },
			opponent2: { score: 2 }, // Ballec Squad
			winnerSide: "opponent1", // POCEBLO
		});

		bracket.updateMatch({
			id: 4,
			opponent1: { score: 16 },
			opponent2: { score: 12 }, // AQUELLEHEURE?!
			winnerSide: "opponent1", // Ballec Squad
		});

		bracket.updateMatch({
			id: 5,
			opponent1: { score: 4 }, // twitch.tv/mrs_fly
			opponent2: { score: 16 },
			winnerSide: "opponent2", // POCEBLO
		});
	});

	test("should unlock next round matches as soon as both participants are ready", () => {
		// Round robin with 4 teams: [1, 2, 3, 4]
		// Round 1: Match 0 (1 vs 2), Match 1 (3 vs 4)
		// Round 2: Match 2 (1 vs 3), Match 3 (2 vs 4)
		// Round 3: Match 4 (1 vs 4), Match 5 (2 vs 3)

		// Initially, only round 1 matches should be ready
		expect(bracket.matchStatus(0)).toBe("STARTED"); // Ready (1 vs 2)
		expect(bracket.matchStatus(1)).toBe("STARTED"); // Ready (3 vs 4)
		expect(bracket.matchStatus(2)).toBe("PENDING"); // Locked (1 vs 3)
		expect(bracket.matchStatus(3)).toBe("PENDING"); // Locked (2 vs 4)

		// Complete first match of round 1 (1 vs 2)
		bracket.updateMatch({
			id: 0,
			opponent1: { score: 16 },
			opponent2: { score: 9 }, // Team 2 loses
			winnerSide: "opponent1", // Team 1 wins
		});

		// Round 2 Match 1 (1 vs 3) should still be locked because team 3 hasn't finished
		// Round 2 Match 2 (2 vs 4) should still be locked because team 4 hasn't finished
		expect(bracket.matchStatus(2)).toBe("PENDING"); // Still Locked
		expect(bracket.matchStatus(3)).toBe("PENDING"); // Still Locked

		// Complete second match of round 1 (3 vs 4)
		bracket.updateMatch({
			id: 1,
			opponent1: { score: 3 }, // Team 3 loses
			opponent2: { score: 16 },
			winnerSide: "opponent2", // Team 4 wins
		});

		// Now both matches in round 2 should be unlocked
		// Match 2 (1 vs 3): both team 1 and team 3 have finished round 1
		// Match 3 (2 vs 4): both team 2 and team 4 have finished round 1
		expect(bracket.matchStatus(2)).toBe("STARTED"); // Ready
		expect(bracket.matchStatus(3)).toBe("STARTED"); // Ready
	});

	test("should lock the next round again if a result of the previous round is reset", () => {
		bracket.updateMatch({
			id: 0,
			opponent1: { score: 16 },
			opponent2: { score: 9 },
			winnerSide: "opponent1",
		});
		bracket.updateMatch({
			id: 1,
			opponent1: { score: 3 },
			opponent2: { score: 16 },
			winnerSide: "opponent2",
		});

		expect(bracket.matchStatus(2)).toBe("STARTED");

		bracket.resetMatchResults(0);

		expect(bracket.matchStatus(2)).toBe("PENDING");
	});

	test("should keep a started next round match playable if a result of the previous round is reset (issue #2690)", () => {
		bracket.updateMatch({
			id: 0,
			opponent1: { score: 16 },
			opponent2: { score: 9 },
			winnerSide: "opponent1",
		});
		bracket.updateMatch({
			id: 1,
			opponent1: { score: 3 },
			opponent2: { score: 16 },
			winnerSide: "opponent2",
		});

		// team 1 and team 3 start playing their round 2 match
		bracket.updateMatch({
			id: 2,
			opponent1: { score: 1 },
			opponent2: { score: 0 },
		});

		bracket.resetMatchResults(0);

		expect(bracket.matchStatus(2)).toBe("STARTED");
		expect(() =>
			bracket.updateMatch({
				id: 2,
				opponent1: { score: 2 },
				opponent2: { score: 0 },
				winnerSide: "opponent1",
			}),
		).not.toThrow();
	});

	test("should leave every match Ready when independentRounds is set", () => {
		bracket.reset();
		bracket.create({
			type: "round_robin",
			seeding: [1, 2, 3, 4],
			settings: { groupCount: 1, independentRounds: true },
		});

		for (const match of bracket.matches()) {
			expect(bracket.matchStatus(match.id)).toBe("STARTED");
		}

		// reporting a round-2 match before round-1 finishes must not throw
		const round2Match = bracket.match(2);
		expect(() =>
			bracket.updateMatch({
				id: round2Match.id,
				opponent1: { score: 16 },
				opponent2: { score: 4 },
				winnerSide: "opponent1",
			}),
		).not.toThrow();
	});

	test("should let the only real match be played in a group with fewer teams than slots", () => {
		bracket.reset();
		// Group sized for 3 but only 2 teams placed (the 3rd slot is a BYE).
		// The two real teams only meet in round 3, preceded by two BYE rounds
		// that can never be reported. The real match must still be playable.
		bracket.create({
			type: "round_robin",
			seeding: [1, 2, null],
			settings: { groupCount: 1 },
		});

		const realMatch = bracket
			.matches()
			.find((m) => m.opponent1?.id && m.opponent2?.id)!;

		expect(bracket.matchStatus(realMatch.id)).toBe("STARTED");

		expect(() =>
			bracket.updateMatch({
				id: realMatch.id,
				opponent1: { score: 16 },
				opponent2: { score: 9 },
				winnerSide: "opponent1",
			}),
		).not.toThrow();
	});

	test("should unlock next round matches with BYE participants", () => {
		bracket.reset();
		// Create a round robin with 3 teams (odd number creates rounds where one team doesn't play)
		bracket.create({
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

		expect(bracket.matchStatus(round1RealMatch.id)).toBe("STARTED");
		expect(bracket.matchStatus(round2RealMatch.id)).toBe("PENDING"); // initially

		// Complete the only real match in round 1 (teams 3 vs 2)
		// Team 1 didn't play in round 1
		bracket.updateMatch({
			id: round1RealMatch.id,
			opponent1: { score: 16 },
			opponent2: { score: 9 },
			winnerSide: "opponent1",
		});

		// The real match in round 2 (teams 1 vs 3) should now be unlocked
		// because team 1 didn't play in round 1 (considered ready)
		// and team 3 just finished their match
		expect(bracket.matchStatus(round2RealMatch.id)).toBe("STARTED");
	});
});
