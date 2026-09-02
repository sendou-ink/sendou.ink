import invariant from "~/utils/invariant";
import { isSetOverByScore, matchEndedEarly } from "../status";
import type { BracketData, EngineResult, MatchData, Side } from "../types";
import { reportResult } from "./report-result";
import { resetMatchResults } from "./reset-result";

const SIDES = ["opponent1", "opponent2"] as const satisfies Side[];

/** Records one game win. If the round's map info (count & best of / play all) says the set is over, the result is set and propagated. */
export function reportGameResult(
	data: BracketData,
	input: { matchId: number; winnerTeamId: number },
): EngineResult & { setOver: boolean } {
	const { match, maps } = findMatchWithMaps(data, input.matchId);

	const scores = currentScores(match);
	scores[sideOfTeam(match, input.winnerTeamId)]++;

	const reported = reportResult(data, { matchId: input.matchId, scores });

	return {
		...reported,
		setOver: isSetOverByScore({
			scores,
			count: maps.count,
			countType: maps.type,
		}),
	};
}

/** Removes the last played game. Back at no games played the whole result is reset, rolling back what was propagated. */
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
		scores: shouldReset ? null : scores,
	});

	if (!shouldReset) return reported;

	const reset = resetMatchResults(reported.data, input.matchId);

	return {
		data: reset.data,
		changedMatches: [...reported.changedMatches, ...reset.changedMatches],
	};
}

/** Ends the set early with the given winner, keeping the scores (organizer action, e.g. the opponent can't play on). */
export function endSet(
	data: BracketData,
	input: { matchId: number; winnerTeamId: number },
): EngineResult {
	const match = findMatch(data, input.matchId);

	return reportResult(data, {
		matchId: input.matchId,
		winnerSide: SIDES[sideOfTeam(match, input.winnerTeamId)],
	});
}

/**
 * Reopens a completed match, clearing the set result. A force-ended set keeps its scores, otherwise
 * the deciding game's score is removed and the caller deletes its game result row (see `endedEarly`).
 */
export function reopenMatch(
	data: BracketData,
	matchId: number,
): EngineResult & { endedEarly: boolean } {
	const { match, maps } = findMatchWithMaps(data, matchId);

	invariant(match.winnerSide, "Match has no result to reopen");

	const endedEarly = matchEndedEarly({
		opponentOne: match.opponent1,
		opponentTwo: match.opponent2,
		winnerSide: match.winnerSide,
		count: maps.count,
		countType: maps.type,
	});

	const scores = currentScores(match);
	if (!endedEarly) {
		invariant(scores[0] !== scores[1], "Scores are equal");
		scores[SIDES.indexOf(match.winnerSide)]--;
	}

	const reported = reportResult(data, { matchId, scores });

	return { ...reported, endedEarly };
}

function findMatch(data: BracketData, matchId: number): MatchData {
	const match = data.match.find((match) => match.id === matchId);
	invariant(match, "Match not found");
	return match;
}

function findMatchWithMaps(data: BracketData, matchId: number) {
	const match = findMatch(data, matchId);
	const round = data.round.find((round) => round.id === match.roundId);
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
