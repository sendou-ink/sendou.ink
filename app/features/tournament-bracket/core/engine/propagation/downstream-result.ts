import { isMatchByeCompleted, isMatchCompleted } from "../status";
import type { BracketData, MatchData } from "../types";
import * as helpers from "./helpers";
import { Store } from "./store";
import { Propagator } from "./traversal";

/**
 * Whether a match the teams of the given one moved on to has a game won or is decided, so taking the
 * given match's result back would pull a team out of a set that has a result. Always false in
 * round robin and swiss, where no result moves a team.
 */
export function matchHasResultDownstream(
	data: BracketData,
	matchId: number,
): boolean {
	const store = new Store(data);
	const stored = store.matchById(matchId);
	if (!stored) throw new Error("Match not found.");

	return hasResultDownstream(store, new Propagator(store), stored);
}

/** {@link matchHasResultDownstream} on the rows of an operation in progress. */
export function hasResultDownstream(
	store: Store,
	propagator: Propagator,
	match: MatchData,
): boolean {
	const stage = store.stageById(match.stageId);
	if (!stage) throw new Error("Stage not found.");
	if (helpers.isRoundRobin(stage) || helpers.isSwiss(stage)) return false;

	const round = store.roundById(match.roundId);
	if (!round) throw new Error("Round not found.");

	const { roundNumber, roundCount } = propagator.getRoundPositionalInfo(
		match.roundId,
	);
	const nextMatches = propagator.getNextMatches(
		match,
		helpers.getMatchLocation(stage.type, round.section),
		stage,
		roundNumber,
		roundCount,
	);

	return nextMatches.some((next) => {
		if (!next) return false;
		// a BYE passes the team straight on to the match after it
		if (isMatchByeCompleted(next)) {
			return hasResultDownstream(store, propagator, next);
		}

		return hasGameWon(next) || isMatchCompleted(next);
	});
}

/** Not `isMatchStarted`: reopening used to leave a 0-0 score behind, which is nothing to lose. */
function hasGameWon(match: MatchData) {
	return (match.opponent1?.score ?? 0) > 0 || (match.opponent2?.score ?? 0) > 0;
}
