import { afterEach, describe, expect, test, vi } from "vitest";
import { matchById } from "../../tests/bracket-fixtures";
import { create } from "../create";
import * as Engine from "../index";
import type { BracketData, MatchData } from "../types";

const DROPPED_TEAM = 2;
/** Of a 4 team single elimination bracket */
const FINAL_ID = 2;

describe("endDroppedTeamMatches", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	test.each([
		{ coinFlip: 0, why: "first team" },
		{ coinFlip: 0.99, why: "second team" },
	])(
		"awards every unfinished match of a dropped team to its opponent, also the rounds not playable yet (a coin flip would pick the $why)",
		({ coinFlip }) => {
			vi.spyOn(Math, "random").mockReturnValue(coinFlip);
			const data = roundRobinOfFour();

			const result = Engine.endDroppedTeamMatches(data, [DROPPED_TEAM]);

			const droppedTeamMatches = result.data.match.filter((match) =>
				hasTeam(match, DROPPED_TEAM),
			);
			expect(droppedTeamMatches).toHaveLength(3);
			for (const match of droppedTeamMatches) {
				expect(winnerId(match)).not.toBe(DROPPED_TEAM);
			}
			expect(result.endedMatchIds.toSorted((a, b) => a - b)).toEqual(
				droppedTeamMatches.map((match) => match.id).toSorted((a, b) => a - b),
			);
		},
	);

	test("keeps the result of a match the dropped team already finished", () => {
		let data = roundRobinOfFour();
		const finishedMatch = data.match.find(
			(match) => match.roundId === 0 && hasTeam(match, DROPPED_TEAM),
		)!;
		data = Engine.reportResult(data, {
			matchId: finishedMatch.id,
			winnerSide:
				finishedMatch.opponent1?.id === DROPPED_TEAM
					? "opponent1"
					: "opponent2",
		}).data;

		const result = Engine.endDroppedTeamMatches(data, [DROPPED_TEAM]);

		expect(winnerId(matchById(result.data, finishedMatch.id))).toBe(
			DROPPED_TEAM,
		);
		expect(result.endedMatchIds).not.toContain(finishedMatch.id);
	});

	test("ends a match between two dropped teams with one of them winning", () => {
		const data = roundRobinOfFour();
		const match = data.match.find(
			(candidate) => hasTeam(candidate, 1) && hasTeam(candidate, 2),
		)!;

		const result = Engine.endDroppedTeamMatches(data, [1, 2]);

		expect([1, 2]).toContain(winnerId(matchById(result.data, match.id)));
		expect(result.endedMatchIds).toContain(match.id);
	});

	test("advances the opponent of a dropped team to the next match", () => {
		const data = create({
			type: "single_elimination",
			seeding: [1, 2, 3, 4],
			settings: null,
		});

		const result = Engine.endDroppedTeamMatches(data, [4]);

		expect(matchById(result.data, FINAL_ID).opponent1?.id).toBe(1);
		expect(result.changedMatches.map((match) => match.id)).toContain(FINAL_ID);
	});

	test("leaves a match of a dropped team waiting for its opponent for later", () => {
		let data = create({
			type: "single_elimination",
			seeding: [1, 2, 3, 4],
			settings: null,
		});
		data = Engine.reportResult(data, {
			matchId: 0,
			winnerSide: "opponent1",
		}).data;

		const result = Engine.endDroppedTeamMatches(data, [1]);

		expect(result.endedMatchIds).toEqual([]);
		expect(matchById(result.data, FINAL_ID).winnerSide).toBeNull();
	});

	test("also ends the match the dropped team is moved to by losing", () => {
		// 1 vs 4 and 2 vs 3, the losers meet in the losers bracket
		let data = create({
			type: "double_elimination",
			seeding: [1, 2, 3, 4],
			settings: null,
		});
		data = Engine.reportResult(data, {
			matchId: data.match.find((match) => match.opponent1?.id === 2)!.id,
			winnerSide: "opponent1",
		}).data;

		const ended = Engine.endDroppedTeamMatches(data, [4]);

		expect(openMatchesOf(ended.data, 4)).toEqual([]);
		expect(ended.endedMatchIds).toHaveLength(2);
	});

	test("also ends the match two dropped teams meet in after winning theirs", () => {
		// 1 vs 4 and 2 vs 3, both sets ended for the dropped team
		let data = create({
			type: "single_elimination",
			seeding: [1, 2, 3, 4],
			settings: { skippedRounds: ["THIRD_PLACE_MATCH"] },
		});
		for (const match of data.match.filter(
			(candidate) => candidate.opponent1?.id,
		)) {
			data = Engine.reportResult(data, {
				matchId: match.id,
				winnerSide: "opponent1",
			}).data;
		}
		data = Engine.reopenMatch(
			{
				...data,
				round: data.round.map((round) => ({
					...round,
					maps: { count: 1, type: "BEST_OF" as const },
				})),
			},
			{
				matchId: data.match.find((match) => match.opponent1?.id === 2)!.id,
				lastGameWinnerTeamId: null,
			},
		).data;

		// 1 already waits in the final, 2 gets there as its semifinal is ended against the dropped 3
		const ended = Engine.endDroppedTeamMatches(data, [1, 2, 3]);

		expect(openMatchesOf(ended.data, 1)).toEqual([]);
	});
});

function openMatchesOf(data: BracketData, teamId: number) {
	return data.match.filter(
		(match) =>
			!match.winnerSide &&
			match.opponent1?.id &&
			match.opponent2?.id &&
			hasTeam(match, teamId),
	);
}

function roundRobinOfFour(): BracketData {
	return create({ type: "round_robin", seeding: [1, 2, 3, 4], settings: null });
}

function hasTeam(match: MatchData, teamId: number) {
	return match.opponent1?.id === teamId || match.opponent2?.id === teamId;
}

function winnerId(match: MatchData) {
	return match.winnerSide ? match[match.winnerSide]?.id : undefined;
}
