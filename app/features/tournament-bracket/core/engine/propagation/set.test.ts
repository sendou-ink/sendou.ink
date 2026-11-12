import { beforeEach, describe, expect, test } from "vitest";
import type { TournamentRoundMaps } from "~/db/tables-json";
import { create } from "../create";
import * as Engine from "../index";
import type { BracketData, MatchData } from "../types";

const TEAM_ONE = 1;
const TEAM_TWO = 2;

describe("Set results in a bracket with map info", () => {
	let data: BracketData;

	beforeEach(() => {
		data = bracketWithMaps({ count: 3, type: "BEST_OF" });
	});

	test("resolves the winner from the scores once the set is over", () => {
		data = Engine.reportGameResult(data, {
			matchId: 0,
			winnerTeamId: TEAM_ONE,
		}).data;
		expect(matchById(data, 0).winnerSide).toBeFalsy();

		const reported = Engine.reportGameResult(data, {
			matchId: 0,
			winnerTeamId: TEAM_ONE,
		});
		data = reported.data;

		expect(reported.setOver).toBe(true);
		expect(matchById(data, 0).winnerSide).toBe("opponent1");
	});

	test("resolves the winner when only the scores are reported", () => {
		data = Engine.reportResult(data, { matchId: 0, scores: [0, 2] }).data;

		expect(matchById(data, 0).winnerSide).toBe("opponent2");
	});

	test("does not resolve a winner for a play all set that ended in a tie", () => {
		data = bracketWithMaps({ count: 2, type: "PLAY_ALL" });

		data = Engine.reportResult(data, { matchId: 0, scores: [1, 1] }).data;

		expect(matchById(data, 0).winnerSide).toBeFalsy();
	});

	test("ends the set early with the given winner, keeping the scores", () => {
		data = Engine.reportGameResult(data, {
			matchId: 0,
			winnerTeamId: TEAM_TWO,
		}).data;

		data = Engine.endSet(data, { matchId: 0, winnerTeamId: TEAM_TWO }).data;

		const after = matchById(data, 0);
		expect(after.winnerSide).toBe("opponent2");
		expect(after.opponent1?.score).toBe(0);
		expect(after.opponent2?.score).toBe(1);
	});

	test("clears the winner when a game is undone", () => {
		for (const _ of [1, 2]) {
			data = Engine.reportGameResult(data, {
				matchId: 0,
				winnerTeamId: TEAM_ONE,
			}).data;
		}

		data = Engine.undoGameResult(data, {
			matchId: 0,
			lastGameWinnerTeamId: TEAM_ONE,
		}).data;

		expect(matchById(data, 0).winnerSide).toBeFalsy();
		expect(matchById(data, 0).opponent1?.score).toBe(1);
	});

	test("refuses a game reported for a team not in the match", () => {
		expect(() =>
			Engine.reportGameResult(data, { matchId: 0, winnerTeamId: 3 }),
		).toThrow();
	});

	test("undoing the only reported game leaves the match not started", () => {
		data = Engine.reportGameResult(data, {
			matchId: 0,
			winnerTeamId: TEAM_TWO,
		}).data;

		data = Engine.undoGameResult(data, {
			matchId: 0,
			lastGameWinnerTeamId: TEAM_TWO,
		}).data;

		expect(Engine.isMatchStarted(matchById(data, 0))).toBe(false);
	});

	test("reopening a finished match takes its winner back out of the next match", () => {
		data = bracketWithMaps({ count: 3, type: "BEST_OF" }, [1, 2, 3, 4]);
		const finalId = 2;
		for (const _ of [1, 2]) {
			data = Engine.reportGameResult(data, {
				matchId: 0,
				winnerTeamId: TEAM_ONE,
			}).data;
		}
		expect(matchById(data, finalId).opponent1?.id).toBe(TEAM_ONE);

		data = Engine.reopenMatch(data, {
			matchId: 0,
			lastGameWinnerTeamId: TEAM_ONE,
		}).data;

		expect(matchById(data, finalId).opponent1?.id).toBeNull();
	});

	test("clears the winner when the match is reopened", () => {
		for (const _ of [1, 2]) {
			data = Engine.reportGameResult(data, {
				matchId: 0,
				winnerTeamId: TEAM_ONE,
			}).data;
		}

		const reopened = Engine.reopenMatch(data, {
			matchId: 0,
			lastGameWinnerTeamId: TEAM_ONE,
		});
		data = reopened.data;

		expect(reopened.endedEarly).toBe(false);
		expect(matchById(data, 0).winnerSide).toBeFalsy();
		expect(matchById(data, 0).opponent1?.score).toBe(1);
	});

	test("clears the winner when a set that ended early is reopened", () => {
		data = Engine.reportGameResult(data, {
			matchId: 0,
			winnerTeamId: TEAM_ONE,
		}).data;
		data = Engine.endSet(data, { matchId: 0, winnerTeamId: TEAM_ONE }).data;

		const reopened = Engine.reopenMatch(data, {
			matchId: 0,
			lastGameWinnerTeamId: TEAM_ONE,
		});
		data = reopened.data;

		expect(reopened.endedEarly).toBe(true);
		expect(matchById(data, 0).winnerSide).toBeFalsy();
		expect(matchById(data, 0).opponent1?.score).toBe(1);
	});

	test.each([
		{ why: "its only game is removed", games: 1 },
		{ why: "it was ended without games", games: 0 },
	])("is back to not started when reopened and $why", ({ games }) => {
		data = bracketWithMaps({ count: 1, type: "BEST_OF" });
		const notStarted = matchById(data, 0);

		data =
			games === 1
				? Engine.reportGameResult(data, { matchId: 0, winnerTeamId: TEAM_ONE })
						.data
				: Engine.endSet(data, { matchId: 0, winnerTeamId: TEAM_ONE }).data;
		data = Engine.reopenMatch(data, {
			matchId: 0,
			lastGameWinnerTeamId: games === 1 ? TEAM_ONE : null,
		}).data;

		expect(Engine.isMatchStarted(matchById(data, 0))).toBe(false);
		expect(matchById(data, 0)).toEqual(notStarted);
	});

	test("removes the last game's score when the set loser won it in a play all set", () => {
		data = bracketWithMaps({ count: 3, type: "PLAY_ALL" });
		for (const winnerTeamId of [TEAM_ONE, TEAM_ONE, TEAM_TWO]) {
			data = Engine.reportGameResult(data, { matchId: 0, winnerTeamId }).data;
		}

		data = Engine.reopenMatch(data, {
			matchId: 0,
			lastGameWinnerTeamId: TEAM_TWO,
		}).data;

		const after = matchById(data, 0);
		expect(after.winnerSide).toBeFalsy();
		expect(after.opponent1?.score).toBe(2);
		expect(after.opponent2?.score).toBe(0);
	});
});

describe("reopenMatch", () => {
	const matchBetween = (data: BracketData, oneId: number, twoId: number) => {
		const matches = data.match.filter((candidate) => {
			const ids = [candidate.opponent1?.id, candidate.opponent2?.id];
			return ids.includes(oneId) && ids.includes(twoId);
		});
		// the teams can meet again in the losers bracket: the one still to be played first
		const match =
			matches.find((candidate) => !candidate.winnerSide) ?? matches[0];
		if (!match) throw new Error(`No match between ${oneId} and ${twoId}`);

		return match;
	};
	const winSet = (
		data: BracketData,
		winnerTeamId: number,
		loserTeamId: number,
	) =>
		Engine.reportGameResult(data, {
			matchId: matchBetween(data, winnerTeamId, loserTeamId).id,
			winnerTeamId,
		}).data;

	test.each([
		{
			why: "the set its winner advanced to was ended without games",
			playOn: (data: BracketData) =>
				Engine.endSet(data, {
					matchId: matchBetween(data, 1, 2).id,
					winnerTeamId: 2,
				}).data,
		},
		{
			why: "the set its winner advanced to has a game played",
			playOn: (data: BracketData) =>
				Engine.reportGameResult(
					bestOfThree(data, matchBetween(data, 1, 2).roundId),
					{ matchId: matchBetween(data, 1, 2).id, winnerTeamId: 1 },
				).data,
		},
	])("refuses once $why", ({ playOn }) => {
		// semifinals 1 vs 4 and 2 vs 3
		let data = bracketWithMaps({ count: 1, type: "BEST_OF" }, [1, 2, 3, 4]);
		data = winSet(data, 1, 4);
		data = winSet(data, 2, 3);
		data = playOn(data);

		expect(() =>
			Engine.reopenMatch(data, {
				matchId: matchBetween(data, 1, 4).id,
				lastGameWinnerTeamId: 1,
			}),
		).toThrow("The match is locked.");
	});

	test("refuses once its loser played on after a BYE in the losers bracket", () => {
		// 3 teams: 1 has a BYE, the loser of 2 vs 3 passes a losers bracket BYE to meet the loser of 1 vs 2
		let data = bracketWithMaps(
			{ count: 1, type: "BEST_OF" },
			[1, 2, 3],
			"double_elimination",
		);
		data = winSet(data, 2, 3);
		data = winSet(data, 1, 2);
		data = winSet(data, 3, 2);

		expect(() =>
			Engine.reopenMatch(data, {
				matchId: data.match.find(
					(match) => match.opponent1?.id === 2 && match.opponent2?.id === 3,
				)!.id,
				lastGameWinnerTeamId: 2,
			}),
		).toThrow("The match is locked.");
	});

	test("reopens while the sets its teams advanced to are not started", () => {
		let data = bracketWithMaps({ count: 1, type: "BEST_OF" }, [1, 2, 3, 4]);
		data = winSet(data, 1, 4);
		data = winSet(data, 2, 3);

		data = Engine.reopenMatch(data, {
			matchId: matchBetween(data, 1, 4).id,
			lastGameWinnerTeamId: 1,
		}).data;

		expect(matchBetween(data, 1, 4).winnerSide).toBeFalsy();
	});

	test("reopens when the set its winner advanced to only holds the 0-0 score reopening used to leave", () => {
		let data = bracketWithMaps({ count: 1, type: "BEST_OF" }, [1, 2, 3, 4]);
		data = winSet(data, 1, 4);
		data = winSet(data, 2, 3);
		data = Engine.reportResult(data, {
			matchId: matchBetween(data, 1, 2).id,
			scores: [0, 0],
		}).data;

		data = Engine.reopenMatch(data, {
			matchId: matchBetween(data, 1, 4).id,
			lastGameWinnerTeamId: 1,
		}).data;

		expect(matchBetween(data, 1, 4).winnerSide).toBeFalsy();
	});
});

function bestOfThree(data: BracketData, roundId: number): BracketData {
	return {
		...data,
		round: data.round.map((round) =>
			round.id === roundId
				? { ...round, maps: { ...round.maps!, count: 3 } }
				: round,
		),
	};
}

function bracketWithMaps(
	maps: Pick<TournamentRoundMaps, "count" | "type">,
	seeding = [TEAM_ONE, TEAM_TWO],
	type: "single_elimination" | "double_elimination" = "single_elimination",
) {
	const input = { type, seeding, settings: null };

	return create({
		...input,
		maps: create(input).round.map((round) => ({
			roundId: round.id,
			...maps,
		})),
	});
}

function matchById(data: BracketData, id: number): MatchData {
	const found = data.match.find((match) => match.id === id);
	if (!found) throw new Error(`Match ${id} not found`);

	return found;
}
