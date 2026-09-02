import { beforeEach, describe, expect, test } from "vitest";
import { createResolved } from "../create";
import * as Engine from "../index";
import type { BracketData } from "../types";

describe("Update scores in a round-robin stage", () => {
	let data: BracketData;

	beforeEach(() => {
		data = createResolved({
			type: "round_robin",
			seeding: [1, 2, 3, 4],
			settings: { groupCount: 1 },
		});
	});

	test("sets all the scores", () => {
		const results: Engine.ReportResultInput[] = [
			{
				matchId: 0,
				scores: [16, 9], // AQUELLEHEURE?!
				winnerSide: "opponent1", // POCEBLO
			},
			{
				matchId: 1,
				scores: [3, 16], // Ballec Squad
				winnerSide: "opponent2", // twitch.tv/mrs_fly
			},
			{
				matchId: 2,
				scores: [16, 0], // AQUELLEHEURE?!
				winnerSide: "opponent1", // twitch.tv/mrs_fly
			},
			{
				matchId: 3,
				scores: [16, 2], // Ballec Squad
				winnerSide: "opponent1", // POCEBLO
			},
			{
				matchId: 4,
				scores: [16, 12], // AQUELLEHEURE?!
				winnerSide: "opponent1", // Ballec Squad
			},
			{
				matchId: 5,
				scores: [4, 16], // twitch.tv/mrs_fly
				winnerSide: "opponent2", // POCEBLO
			},
		];

		for (const result of results) {
			data = Engine.reportResult(data, result).data;
		}

		for (const result of results) {
			expect(matchById(data, result.matchId).winnerSide).toBe(
				result.winnerSide,
			);
		}
	});

	test("unlocks next round matches as soon as both participants are ready", () => {
		// 4 teams. Round 1: (1 vs 2), (3 vs 4). Round 2: (1 vs 3), (2 vs 4). Round 3: (1 vs 4), (2 vs 3)

		expect(Engine.matchStatus(data, 0)).toBe("STARTED"); // Ready (1 vs 2)
		expect(Engine.matchStatus(data, 1)).toBe("STARTED"); // Ready (3 vs 4)
		expect(Engine.matchStatus(data, 2)).toBe("PENDING"); // Locked (1 vs 3)
		expect(Engine.matchStatus(data, 3)).toBe("PENDING"); // Locked (2 vs 4)

		data = Engine.reportResult(data, {
			matchId: 0,
			scores: [16, 9], // Team 2 loses
			winnerSide: "opponent1", // Team 1 wins
		}).data;

		// round 2 still locked because teams 3 and 4 haven't finished
		expect(Engine.matchStatus(data, 2)).toBe("PENDING"); // Still Locked
		expect(Engine.matchStatus(data, 3)).toBe("PENDING"); // Still Locked

		data = Engine.reportResult(data, {
			matchId: 1,
			scores: [3, 16], // Team 3 loses
			winnerSide: "opponent2", // Team 4 wins
		}).data;

		expect(Engine.matchStatus(data, 2)).toBe("STARTED"); // Ready
		expect(Engine.matchStatus(data, 3)).toBe("STARTED"); // Ready
	});

	test("locks the next round again if a result of the previous round is reset", () => {
		data = Engine.reportResult(data, {
			matchId: 0,
			scores: [16, 9],
			winnerSide: "opponent1",
		}).data;
		data = Engine.reportResult(data, {
			matchId: 1,
			scores: [3, 16],
			winnerSide: "opponent2",
		}).data;

		expect(Engine.matchStatus(data, 2)).toBe("STARTED");

		data = Engine.resetMatchResults(data, 0).data;

		expect(Engine.matchStatus(data, 2)).toBe("PENDING");
	});

	test("keeps a started next round match playable if a result of the previous round is reset (issue #2690)", () => {
		data = Engine.reportResult(data, {
			matchId: 0,
			scores: [16, 9],
			winnerSide: "opponent1",
		}).data;
		data = Engine.reportResult(data, {
			matchId: 1,
			scores: [3, 16],
			winnerSide: "opponent2",
		}).data;

		// team 1 and team 3 start playing their round 2 match
		data = Engine.reportResult(data, {
			matchId: 2,
			scores: [1, 0],
		}).data;

		data = Engine.resetMatchResults(data, 0).data;

		expect(Engine.matchStatus(data, 2)).toBe("STARTED");
		expect(() =>
			Engine.reportResult(data, {
				matchId: 2,
				scores: [2, 0],
				winnerSide: "opponent1",
			}),
		).not.toThrow();
	});

	test("leaves every match Ready when independentRounds is set", () => {
		data = createResolved({
			type: "round_robin",
			seeding: [1, 2, 3, 4],
			settings: { groupCount: 1, independentRounds: true },
		});

		for (const match of data.match) {
			expect(Engine.matchStatus(data, match.id)).toBe("STARTED");
		}

		// reporting a round-2 match before round-1 finishes must not throw
		expect(() =>
			Engine.reportResult(data, {
				matchId: 2,
				scores: [16, 4],
				winnerSide: "opponent1",
			}),
		).not.toThrow();
	});

	test("lets the only real match be played in a group with fewer teams than slots", () => {
		// Group sized for 3 but only 2 teams placed (the 3rd slot is a BYE).
		// The two real teams only meet in round 3, preceded by two BYE rounds
		// that can never be reported. The real match must still be playable.
		data = createResolved({
			type: "round_robin",
			seeding: [1, 2, null],
			settings: { groupCount: 1 },
		});

		const realMatch = data.match.find(
			(match) => match.opponent1?.id && match.opponent2?.id,
		)!;

		expect(Engine.matchStatus(data, realMatch.id)).toBe("STARTED");

		expect(() =>
			Engine.reportResult(data, {
				matchId: realMatch.id,
				scores: [16, 9],
				winnerSide: "opponent1",
			}),
		).not.toThrow();
	});

	test("unlocks next round matches with BYE participants", () => {
		data = createResolved({
			type: "round_robin",
			seeding: [1, 2, 3],
			settings: { groupCount: 1 },
		});

		// 3 teams, one sits out each round. Round 1: 3 vs 2. Round 2: 1 vs 3. Round 3: 2 vs 1

		const round1RealMatch = data.match.find(
			(match) =>
				match.roundId === data.round[0].id &&
				match.opponent1 &&
				match.opponent2,
		)!;
		const round2RealMatch = data.match.find(
			(match) =>
				match.roundId === data.round[1].id &&
				match.opponent1 &&
				match.opponent2,
		)!;

		expect(Engine.matchStatus(data, round1RealMatch.id)).toBe("STARTED");
		expect(Engine.matchStatus(data, round2RealMatch.id)).toBe("PENDING"); // initially

		data = Engine.reportResult(data, {
			matchId: round1RealMatch.id,
			scores: [16, 9],
			winnerSide: "opponent1",
		}).data;

		// team 1 sat out round 1 (considered ready) and team 3 just finished
		expect(Engine.matchStatus(data, round2RealMatch.id)).toBe("STARTED");
	});
});

function matchById(data: BracketData, id: number) {
	const found = data.match.find((match) => match.id === id);
	if (!found) throw new Error(`Match ${id} not found`);

	return found;
}
