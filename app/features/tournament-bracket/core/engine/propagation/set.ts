import * as R from "remeda";
import type { TournamentRoundMaps } from "~/db/tables";
import invariant from "~/utils/invariant";
import type { BracketData, EngineResult, MatchData, Result } from "../types";
import { reportResult } from "./report-result";
import { resetMatchResults } from "./reset-result";

/**
 * Records one game win for the given team, resolving from the round's map
 * info (count & best of / play all) whether the set is now over. When it is,
 * the win/loss results are set and propagated (advancements, unlocks etc.).
 */
export function reportGameResult(
	data: BracketData,
	input: { matchId: number; winnerTeamId: number },
): EngineResult & { setOver: boolean } {
	const { match, maps } = findMatchWithMaps(data, input.matchId);

	const scores = currentScores(match);
	scores[sideOfTeam(match, input.winnerTeamId)]++;

	const setOver = isSetOverByScore({
		scores,
		count: maps.count,
		countType: maps.type,
	});

	const reported = reportResult(data, {
		matchId: input.matchId,
		opponent1: {
			score: scores[0],
			result: setOver && scores[0] > scores[1] ? "win" : undefined,
		},
		opponent2: {
			score: scores[1],
			result: setOver && scores[1] > scores[0] ? "win" : undefined,
		},
	});

	return { ...reported, setOver };
}

/**
 * Removes the last played game from a match. If the match goes back to no
 * games played, the whole match result is reset, rolling back anything that
 * was propagated from it.
 */
export function undoGameResult(
	data: BracketData,
	input: { matchId: number; lastGameWinnerTeamId: number },
): EngineResult {
	const match = findMatch(data, input.matchId);

	const scores = currentScores(match);
	const side = sideOfTeam(match, input.lastGameWinnerTeamId);
	invariant(scores[side] > 0, "No game to undo for the given team");
	scores[side]--;

	const shouldReset = scores[0] === 0 && scores[1] === 0;

	const reported = reportResult(data, {
		matchId: input.matchId,
		opponent1: { score: shouldReset ? undefined : scores[0] },
		opponent2: { score: shouldReset ? undefined : scores[1] },
	});

	if (!shouldReset) return reported;

	const reset = resetMatchResults(reported.data, input.matchId);

	return {
		data: reset.data,
		changedMatches: [...reported.changedMatches, ...reset.changedMatches],
	};
}

/**
 * Ends the set early with the given team as the winner, keeping the current
 * scores as they are (an organizer action; e.g. the opponent can not play out
 * the rest of the set).
 */
export function endSet(
	data: BracketData,
	input: { matchId: number; winnerTeamId: number },
): EngineResult {
	const match = findMatch(data, input.matchId);
	const winnerSide = sideOfTeam(match, input.winnerTeamId);

	return reportResult(data, {
		matchId: input.matchId,
		opponent1: {
			score: match.opponent1?.score,
			result: winnerSide === 0 ? "win" : "loss",
		},
		opponent2: {
			score: match.opponent2?.score,
			result: winnerSide === 1 ? "win" : "loss",
		},
	});
}

/**
 * Reopens a completed match for further reporting, clearing the set result.
 * Resolves from the round's map info whether the set had been force-ended
 * early: if it was, the scores are kept as is; otherwise the deciding game's
 * score is removed (the caller is expected to delete the corresponding game
 * result row, see `endedEarly` in the return value).
 */
export function reopenMatch(
	data: BracketData,
	matchId: number,
): EngineResult & { endedEarly: boolean } {
	const { match, maps } = findMatchWithMaps(data, matchId);

	invariant(
		match.opponent1?.result === "win" || match.opponent2?.result === "win",
		"Match has no result to reopen",
	);

	const endedEarly = matchEndedEarly({
		opponentOne: {
			score: match.opponent1?.score,
			result: match.opponent1?.result,
		},
		opponentTwo: {
			score: match.opponent2?.score,
			result: match.opponent2?.result,
		},
		count: maps.count,
		countType: maps.type,
	});

	const scores = currentScores(match);
	if (!endedEarly) {
		invariant(scores[0] !== scores[1], "Scores are equal");
		scores[match.opponent1?.result === "win" ? 0 : 1]--;
	}

	const reported = reportResult(data, {
		matchId,
		opponent1: { score: scores[0], result: undefined },
		opponent2: { score: scores[1], result: undefined },
	});

	return { ...reported, endedEarly };
}

/** Whether a set is decided given the games each side has won and the round's count settings. */
export function isSetOverByScore({
	scores,
	count,
	countType,
}: {
	scores: [number, number];
	count: number;
	countType: TournamentRoundMaps["type"];
}) {
	if (countType === "PLAY_ALL") {
		return R.sum(scores) === count;
	}

	const matchOverAtXWins = Math.ceil(count / 2);
	return scores[0] === matchOverAtXWins || scores[1] === matchOverAtXWins;
}

/** Whether a completed match was ended before the set was decided by the games played (e.g. by an organizer force-ending it). */
export function matchEndedEarly({
	opponentOne,
	opponentTwo,
	count,
	countType,
}: {
	opponentOne: { score?: number; result?: Result };
	opponentTwo: { score?: number; result?: Result };
	count: number;
	countType: TournamentRoundMaps["type"];
}) {
	if (opponentOne.result !== "win" && opponentTwo.result !== "win") {
		return false;
	}

	const scores: [number, number] = [
		opponentOne.score ?? 0,
		opponentTwo.score ?? 0,
	];

	return !isSetOverByScore({ scores, count, countType });
}

function findMatch(data: BracketData, matchId: number): MatchData {
	const match = data.match.find((match) => match.id === matchId);
	invariant(match, "Match not found");
	return match;
}

function findMatchWithMaps(data: BracketData, matchId: number) {
	const match = findMatch(data, matchId);
	const round = data.round.find((round) => round.id === match.round_id);
	invariant(round?.maps, "Round of the match has no maps");

	return { match, maps: round.maps };
}

function currentScores(match: MatchData): [number, number] {
	return [match.opponent1?.score ?? 0, match.opponent2?.score ?? 0];
}

function sideOfTeam(match: MatchData, teamId: number): 0 | 1 {
	if (match.opponent1?.id === teamId) return 0;
	if (match.opponent2?.id === teamId) return 1;

	throw Error(`Team id ${teamId} is not in the match`);
}
