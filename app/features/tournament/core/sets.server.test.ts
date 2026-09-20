import { describe, expect, test } from "vitest";
import type { FindByTournamentTeamIdItem } from "~/features/tournament-match/TournamentMatchRepository.server";
import { type AllRoundsItem, tournamentTeamSets } from "./sets.server";

const ALL_ROUNDS: AllRoundsItem[] = [
	{
		stageId: 1,
		stageName: "Main bracket",
		stageType: "single_elimination",
		roundNumber: 1,
		section: "winners",
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
		section: "winners",
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
