import type { BracketData, MatchData, MatchResults, RoundData } from "./types";

/**
 * The state of a match. Never persisted, always derived from the opponents of
 * the match and (for round robin) the progress of the previous round.
 *
 * - `PENDING` an opponent is still unknown, the match is a BYE or the teams are
 *   busy playing an earlier round.
 * - `STARTED` the match can be played and might already be in progress.
 * - `COMPLETED` the match has a winner.
 */
export type MatchStatus = "PENDING" | "STARTED" | "COMPLETED";

/** Derives the status of every match of the bracket, keyed by match id. */
export function matchStatuses(data: BracketData): Map<number, MatchStatus> {
	const context = bracketContext(data);

	return new Map(
		data.match.map((match) => [match.id, resolveStatus(match, context)]),
	);
}

/**
 * Derives the status of one match of the bracket. Prefer {@link matchStatuses}
 * when the status of many matches of the same bracket is needed.
 */
export function matchStatus(data: BracketData, matchId: number): MatchStatus {
	const match = data.match.find((match) => match.id === matchId);
	if (!match) throw new Error(`Match not found: ${matchId}`);

	return resolveStatus(match, bracketContext(data));
}

/**
 * Checks if a match has had at least one game reported.
 *
 * @param match A match's results.
 */
export function isMatchStarted(match: MatchResults): boolean {
	return (
		match.opponent1?.score !== undefined || match.opponent2?.score !== undefined
	);
}

/**
 * Checks if a match is completed.
 *
 * @param match A match's results.
 */
export function isMatchCompleted(match: MatchResults): boolean {
	return isMatchByeCompleted(match) || Boolean(match.winnerSide);
}

/**
 * Checks if a match is completed because of at least one BYE.
 *
 * A match "BYE vs. TBD" isn't considered completed yet.
 *
 * @param match A match's results.
 */
export function isMatchByeCompleted(match: MatchResults): boolean {
	return (
		(match.opponent1 === null && match.opponent2?.id !== null) || // BYE vs. someone
		(match.opponent2 === null && match.opponent1?.id !== null) || // someone vs. BYE
		(match.opponent1 === null && match.opponent2 === null)
	); // BYE vs. BYE
}

interface BracketContext {
	roundsById: Map<number, RoundData>;
	roundByGroupAndNumber: Map<string, RoundData>;
	matchesByRoundId: Map<number, MatchData[]>;
	hasDependentRoundsByStageId: Map<number, boolean>;
}

function resolveStatus(match: MatchData, context: BracketContext): MatchStatus {
	if (isMatchCompleted(match)) return "COMPLETED";

	if (!match.opponent1?.id || !match.opponent2?.id) return "PENDING";

	// a match that is being played can't go back to pending e.g. because the
	// result of an earlier match was reopened (issue #2690)
	if (isMatchStarted(match)) return "STARTED";

	if (isWaitingForPreviousRound(match, context)) return "PENDING";

	return "STARTED";
}

/**
 * In a round robin where the rounds are not independent both opponents are
 * known from the start but they can only play once they are done with the
 * previous round.
 */
function isWaitingForPreviousRound(
	match: MatchData,
	context: BracketContext,
): boolean {
	if (!context.hasDependentRoundsByStageId.get(match.stageId)) return false;

	const round = context.roundsById.get(match.roundId);
	if (!round || round.number === 1) return false;

	const previousRound = context.roundByGroupAndNumber.get(
		roundKey(round.groupId, round.number - 1),
	);
	if (!previousRound) return false;

	const previousMatches = context.matchesByRoundId.get(previousRound.id) ?? [];

	return [match.opponent1?.id, match.opponent2?.id].some(
		(opponentId) =>
			opponentId && !hasFinishedRound(opponentId, previousMatches),
	);
}

function hasFinishedRound(opponentId: number, roundMatches: MatchData[]) {
	const match = roundMatches.find(
		(match) =>
			match.opponent1?.id === opponentId || match.opponent2?.id === opponentId,
	);

	// no match in the round = they sat the round out
	if (!match) return true;

	return isMatchCompleted(match);
}

function bracketContext(data: BracketData): BracketContext {
	const roundsById = new Map<number, RoundData>();
	const roundByGroupAndNumber = new Map<string, RoundData>();
	for (const round of data.round) {
		roundsById.set(round.id, round);
		roundByGroupAndNumber.set(roundKey(round.groupId, round.number), round);
	}

	const matchesByRoundId = new Map<number, MatchData[]>();
	for (const match of data.match) {
		const matches = matchesByRoundId.get(match.roundId);
		if (matches) {
			matches.push(match);
		} else {
			matchesByRoundId.set(match.roundId, [match]);
		}
	}

	const hasDependentRoundsByStageId = new Map(
		data.stage.map((stage) => [
			stage.id,
			stage.type === "round_robin" && !stage.settings.independentRounds,
		]),
	);

	return {
		roundsById,
		roundByGroupAndNumber,
		matchesByRoundId,
		hasDependentRoundsByStageId,
	};
}

function roundKey(groupId: number, roundNumber: number) {
	return `${groupId}-${roundNumber}`;
}
