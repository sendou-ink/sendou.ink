import { describe, expect, test } from "vitest";
import type { FindByTournamentTeamIdItem } from "~/features/tournament-match/TournamentMatchRepository.server";
import {
	type AllRoundsItem,
	tournamentTeamSets,
	winCounts,
} from "./sets.server";

describe("winCounts", () => {
	test("returns 0% (not NaN) when there are no played sets", () => {
		const result = winCounts([]);

		expect(result.sets.percentage).toBe(0);
		expect(result.maps.percentage).toBe(0);
	});

	test("counts a set the team won on the bracket but lost on maps as a win", () => {
		// e.g. the opponent forfeited after winning games and the organizer awarded it 2-1
		const result = winCounts([
			{
				tournamentMatchId: 1,
				score: [2, 1],
				result: "win",
				round: { type: "winners", round: 1 },
				stageName: "Main bracket",
				maps: [
					{ stageId: 1, modeShort: "SZ", result: "loss", source: "BOTH" },
					{ stageId: 2, modeShort: "TC", result: "loss", source: "BOTH" },
					{ stageId: 3, modeShort: "RM", result: "win", source: "BOTH" },
				],
				opponent: { id: 2, name: "Opponent", roster: [] },
			},
		]);

		expect(result.sets.won).toBe(1);
	});

	test("counts a set that ended early with the maps split as a win", () => {
		const result = winCounts([
			{
				tournamentMatchId: 1,
				score: [1, 1],
				result: "win",
				round: { type: "winners", round: 1 },
				stageName: "Main bracket",
				maps: [
					{ stageId: 1, modeShort: "SZ", result: "win", source: "BOTH" },
					{ stageId: 2, modeShort: "TC", result: "loss", source: "BOTH" },
				],
				opponent: { id: 2, name: "Opponent", roster: [] },
			},
		]);

		expect(result.sets.won).toBe(1);
	});

	test("counts a set the team lost on the bracket but won on maps as a loss", () => {
		const result = winCounts([
			{
				tournamentMatchId: 1,
				score: [2, 1],
				result: "loss",
				round: { type: "winners", round: 1 },
				stageName: "Main bracket",
				maps: [
					{ stageId: 1, modeShort: "SZ", result: "win", source: "BOTH" },
					{ stageId: 2, modeShort: "TC", result: "loss", source: "BOTH" },
					{ stageId: 3, modeShort: "RM", result: "win", source: "BOTH" },
				],
				opponent: { id: 2, name: "Opponent", roster: [] },
			},
		]);

		expect(result.sets.won).toBe(0);
		expect(result.maps.won).toBe(2);
	});
});

const ALL_ROUNDS: AllRoundsItem[] = [
	{
		stageId: 1,
		stageName: "Main bracket",
		stageType: "single_elimination",
		roundNumber: 1,
		groupNumber: 1,
	},
];

/** A played Bo3 the team being viewed lost 1-2 on the maps. */
function playedSetRow(
	overrides: Partial<FindByTournamentTeamIdItem>,
): FindByTournamentTeamIdItem {
	return {
		tournamentMatchId: 1,
		winnerSide: "opponent1",
		teamSide: "opponent1",
		opponentOneScore: 1,
		opponentTwoScore: 2,
		otherTeamId: 2,
		otherTeamName: "Opponent",
		roundNumber: 1,
		stageId: 1,
		groupNumber: 1,
		matches: [
			{ mode: "SZ", stageId: 1, source: "BOTH", wasWinner: 1 },
			{ mode: "TC", stageId: 2, source: "BOTH", wasWinner: 0 },
			{ mode: "RM", stageId: 3, source: "BOTH", wasWinner: 0 },
		],
		players: [],
		...overrides,
	};
}

describe("tournamentTeamSets", () => {
	test("orders the score by the slot the team being viewed is in", () => {
		const [set] = tournamentTeamSets({
			sets: [playedSetRow({ teamSide: "opponent2" })],
			allRounds: ALL_ROUNDS,
		});

		expect(set.score).toEqual([2, 1]);
	});

	test("takes the set result from the bracket winner even when the maps disagree", () => {
		// organizer overrode the winner after reports: won on the bracket, lost 1-2 on the maps
		const [set] = tournamentTeamSets({
			sets: [playedSetRow({ teamSide: "opponent1", winnerSide: "opponent1" })],
			allRounds: ALL_ROUNDS,
		});

		expect(set.result).toBe("win");
		expect(set.score).toEqual([1, 2]);
	});
});
