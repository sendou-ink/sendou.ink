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

	test("clears the winner when the match is reopened", () => {
		for (const _ of [1, 2]) {
			data = Engine.reportGameResult(data, {
				matchId: 0,
				winnerTeamId: TEAM_ONE,
			}).data;
		}

		const reopened = Engine.reopenMatch(data, 0);
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

		const reopened = Engine.reopenMatch(data, 0);
		data = reopened.data;

		expect(reopened.endedEarly).toBe(true);
		expect(matchById(data, 0).winnerSide).toBeFalsy();
		expect(matchById(data, 0).opponent1?.score).toBe(1);
	});
});

function bracketWithMaps(maps: Pick<TournamentRoundMaps, "count" | "type">) {
	const input = {
		type: "single_elimination" as const,
		seeding: [TEAM_ONE, TEAM_TWO],
		settings: null,
	};

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
