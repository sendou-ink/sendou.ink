import { defaultMinorOrdering, ordering } from "../create/seeding";
import { isMatchByeCompleted, isMatchCompleted } from "../status";
import type {
	GroupType,
	MatchData,
	MatchResults,
	MatchResultsInput,
	SeedOrdering,
	Side,
	StageData,
	StageType,
} from "../types";

export type SetNextOpponent = (
	nextMatch: MatchData,
	nextSide: Side,
	match?: MatchData,
	currentSide?: Side,
) => void;

/**
 * Returns the winner side or `null` if no winner.
 *
 * @param match A match's results.
 */
export function getMatchResult(match: MatchResults): Side | null {
	if (!isMatchCompleted(match)) return null;

	if (match.winnerSide) return match.winnerSide;

	// a BYE that has not been propagated yet
	if (match.opponent1 === null && match.opponent2 !== null) return "opponent2";
	if (match.opponent2 === null && match.opponent1 !== null) return "opponent1";

	return null;
}

/**
 * Gets the other side of a match.
 *
 * @param side The side that we don't want.
 */
export function getOtherSide(side: Side): Side {
	return side === "opponent1" ? "opponent2" : "opponent1";
}

/**
 * Indicates whether a match has at least one BYE or not.
 *
 * @param match A match's results.
 */
export function hasBye(match: MatchResults): boolean {
	return match.opponent1 === null || match.opponent2 === null;
}

/**
 * Updates a match results based on an input.
 *
 * @param stored A reference to what will be updated in the storage.
 * @param scores Games won by each side. `undefined` keeps them, `null` clears them.
 * @param winnerSide The resolved winner of the set, if any.
 * @returns `true` if the match was completed or un-completed by the update.
 */
export function setMatchResults(
	stored: MatchResults,
	scores: MatchResultsInput["scores"],
	winnerSide: Side | undefined,
): boolean {
	const currentlyCompleted = isMatchCompleted(stored);

	setScores(stored, scores);

	if (winnerSide) {
		stored.winnerSide = winnerSide;
		return true;
	}

	if (currentlyCompleted) {
		clearWinner(stored);
		return true;
	}

	return false;
}

/**
 * Clears the winner of a match, marking it as not completed.
 *
 * @param stored A reference to what will be updated in the storage.
 */
export function clearWinner(stored: MatchResults): void {
	stored.winnerSide = null;
}

/**
 * Completes a match that is decided by a BYE, marking the side that has an
 * opponent as the winner. Does nothing to a match that is not decided by a BYE.
 *
 * @param match A reference to what will be updated in the storage.
 */
export function resolveByeWinner(match: MatchResults): void {
	if (match.winnerSide) return;
	if (!isMatchByeCompleted(match)) return;

	if (match.opponent1 && !match.opponent2) {
		match.winnerSide = "opponent1";
	} else if (!match.opponent1 && match.opponent2) {
		match.winnerSide = "opponent2";
	}
}

/**
 * Gets the side the winner of the current match will go to in the next match.
 *
 * @param matchNumber Number of the current match.
 * @param roundNumber Number of the current round.
 * @param roundCount Count of rounds.
 * @param matchLocation Location of the current match.
 */
export function getNextSide(
	matchNumber: number,
	roundNumber: number,
	roundCount: number,
	matchLocation: GroupType,
): Side {
	// The nextSide comes from the same bracket.
	if (matchLocation === "loser_bracket" && roundNumber % 2 === 1)
		return "opponent2";

	// The nextSide comes from the loser bracket to the final group.
	if (matchLocation === "loser_bracket" && roundNumber === roundCount)
		return "opponent2";

	return getSide(matchNumber);
}

/**
 * Gets the side the winner of the current match in loser bracket will go in the next match.
 *
 * @param matchNumber Number of the match.
 * @param nextMatch The next match.
 * @param roundNumber Number of the current round.
 */
export function getNextSideLoserBracket(
	matchNumber: number,
	nextMatch: MatchData,
	roundNumber: number,
): Side {
	// The nextSide comes from the WB.
	if (roundNumber > 1) return "opponent1";

	// The nextSide comes from the WB round 1.
	if (nextMatch.opponent1?.position === matchNumber) return "opponent1";

	return "opponent2";
}

/**
 * Sets an opponent in the next match he has to go.
 *
 * @param nextMatch A match which follows the current one.
 * @param nextSide The side the opponent will be on in the next match.
 * @param match The current match.
 * @param currentSide The side the opponent is currently on.
 */
export function setNextOpponent(
	nextMatch: MatchData,
	nextSide: Side,
	match?: MatchData,
	currentSide?: Side,
): void {
	nextMatch[nextSide] = match![currentSide!] && {
		// Keep BYE.
		id: getOpponentId(match!, currentSide!), // This implementation of SetNextOpponent always has those arguments.
		position: nextMatch[nextSide]?.position, // Keep position.
	};
	nextMatch.winnerSide = null; // A match whose opponents changed can't keep its winner.
}

/**
 * Resets an opponent in the match following the current one.
 *
 * @param nextMatch A match which follows the current one.
 * @param nextSide The side the opponent will be on in the next match.
 */
export function resetNextOpponent(nextMatch: MatchData, nextSide: Side): void {
	nextMatch[nextSide] = nextMatch[nextSide] && {
		// Keep BYE.
		id: null,
		position: nextMatch[nextSide]?.position, // Keep position.
	};
	nextMatch.winnerSide = null; // A match whose opponents changed can't keep its winner.
}

/**
 * Returns the real (because of loser ordering) number of a match in a loser bracket.
 *
 * @param participantCount The number of participants in a stage.
 * @param roundNumber Number of the round.
 * @param matchNumber Number of the match.
 * @param method The method used for the round.
 */
export function findLoserMatchNumber(
	participantCount: number,
	roundNumber: number,
	matchNumber: number,
	method?: SeedOrdering,
): number {
	const loserCount = getLoserRoundLoserCount(participantCount, roundNumber);
	const losers = Array.from(Array(loserCount), (_, i) => i + 1);
	const ordered = method ? ordering[method](losers) : losers;
	const matchNumberLB = ordered.indexOf(matchNumber) + 1;

	// For LB round 1, the list of losers is spread over the matches 2 by 2.
	if (roundNumber === 1) return Math.ceil(matchNumberLB / 2);

	return matchNumberLB;
}

/**
 * Returns the ordering method of a round of a loser bracket.
 *
 * @param participantCount The number of participants in the stage.
 * @param roundNumber Number of the round.
 */
export function getLoserOrdering(
	participantCount: number,
	roundNumber: number,
): SeedOrdering | undefined {
	return defaultMinorOrdering[participantCount]?.[Math.floor(roundNumber / 2)];
}

/**
 * Returns the match number of the corresponding match in the next round by dividing by two.
 *
 * @param matchNumber The current match number.
 */
export function getDiagonalMatchNumber(matchNumber: number): number {
	return Math.ceil(matchNumber / 2);
}

/**
 * Checks if a stage is a round-robin stage.
 *
 * @param stage The stage to check.
 */
export function isRoundRobin(stage: StageData): boolean {
	return stage.type === "round_robin";
}

/**
 * Checks if a stage is a swiss stage.
 *
 * @param stage The stage to check.
 */
export function isSwiss(stage: StageData): boolean {
	return stage.type === "swiss";
}

/**
 * Returns the type of group the match is located into.
 *
 * @param stageType Type of the stage.
 * @param groupNumber Number of the group.
 */
export function getMatchLocation(
	stageType: StageType,
	groupNumber: number,
): GroupType {
	if (isWinnerBracket(stageType, groupNumber)) return "winner_bracket";

	if (isLoserBracket(stageType, groupNumber)) return "loser_bracket";

	if (isFinalGroup(stageType, groupNumber)) return "final_group";

	return "single_bracket";
}

/**
 * Gets the side where the winner of the given match will go in the next match.
 *
 * @param matchNumber Number of the match.
 */
function getSide(matchNumber: number): Side {
	return matchNumber % 2 === 1 ? "opponent1" : "opponent2";
}

/**
 * Updates the scores of a match.
 *
 * @param stored A reference to what will be updated in the storage.
 * @param scores Games won by each side. `undefined` keeps them, `null` clears them.
 */
function setScores(
	stored: MatchResults,
	scores: MatchResultsInput["scores"],
): void {
	if (scores === undefined) return;

	if (stored.opponent1) stored.opponent1.score = scores?.[0];
	if (stored.opponent2) stored.opponent2.score = scores?.[1];
}

/**
 * Gets the id of the opponent at the given side of the given match.
 *
 * @param match The match to get the opponent from.
 * @param side The side where to get the opponent from.
 */
function getOpponentId(match: MatchResults, side: Side): number | null {
	const opponent = match[side];
	return opponent?.id ?? null;
}

/**
 * Returns the count of matches in a round of a loser bracket.
 *
 * @param participantCount The number of participants in a stage.
 * @param roundNumber Number of the round.
 */
function getLoserRoundMatchCount(
	participantCount: number,
	roundNumber: number,
): number {
	const roundPairIndex = Math.ceil(roundNumber / 2) - 1;
	const roundPairCount = Math.log2(participantCount) - 1;
	const matchCount = 2 ** (roundPairCount - roundPairIndex - 1);
	return matchCount;
}

/**
 * Returns the count of losers in a round of a loser bracket.
 *
 * @param participantCount The number of participants in a stage.
 * @param roundNumber Number of the round.
 */
function getLoserRoundLoserCount(
	participantCount: number,
	roundNumber: number,
): number {
	const matchCount = getLoserRoundMatchCount(participantCount, roundNumber);

	// Two per match for LB round 1 (losers coming from WB round 1).
	if (roundNumber === 1) return matchCount * 2;

	return matchCount; // One per match for LB minor rounds.
}

/**
 * Checks if a group is a winner bracket.
 *
 * It's not always the opposite of `isLoserBracket()`: it could be the only bracket of a single elimination stage.
 *
 * @param stageType Type of the stage.
 * @param groupNumber Number of the group.
 */
function isWinnerBracket(stageType: StageType, groupNumber: number): boolean {
	return stageType === "double_elimination" && groupNumber === 1;
}

/**
 * Checks if a group is a loser bracket.
 *
 * @param stageType Type of the stage.
 * @param groupNumber Number of the group.
 */
function isLoserBracket(stageType: StageType, groupNumber: number): boolean {
	return stageType === "double_elimination" && groupNumber === 2;
}

/**
 * Checks if a group is a final group (consolation final or grand final).
 *
 * @param stageType Type of the stage.
 * @param groupNumber Number of the group.
 */
function isFinalGroup(stageType: StageType, groupNumber: number): boolean {
	return (
		(stageType === "single_elimination" && groupNumber === 2) ||
		(stageType === "double_elimination" && groupNumber === 3)
	);
}
