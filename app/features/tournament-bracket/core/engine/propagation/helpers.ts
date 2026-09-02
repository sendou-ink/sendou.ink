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

/** Winner side or `null` if no winner. */
export function getMatchResult(match: MatchResults): Side | null {
	if (!isMatchCompleted(match)) return null;

	if (match.winnerSide) return match.winnerSide;

	// a BYE that has not been propagated yet
	if (match.opponent1 === null && match.opponent2 !== null) return "opponent2";
	if (match.opponent2 === null && match.opponent1 !== null) return "opponent1";

	return null;
}

/** The other side of a match. */
export function getOtherSide(side: Side): Side {
	return side === "opponent1" ? "opponent2" : "opponent1";
}

/** Whether a match has at least one BYE. */
export function hasBye(match: MatchResults): boolean {
	return match.opponent1 === null || match.opponent2 === null;
}

/**
 * Updates a match's results in place.
 *
 * @param scores Games won by each side. `undefined` keeps them, `null` clears them.
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

/** Clears the winner of a match, marking it as not completed. */
export function clearWinner(stored: MatchResults): void {
	stored.winnerSide = null;
}

/** Marks the side with an opponent as the winner of a match decided by a BYE, otherwise no-op. */
export function resolveByeWinner(match: MatchResults): void {
	if (match.winnerSide) return;
	if (!isMatchByeCompleted(match)) return;

	if (match.opponent1 && !match.opponent2) {
		match.winnerSide = "opponent1";
	} else if (!match.opponent1 && match.opponent2) {
		match.winnerSide = "opponent2";
	}
}

/** Side the winner of the current match will go to in the next match. */
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

/** Side the loser of the current winner bracket match will go to in the loser bracket match. */
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

/** Moves the opponent at `currentSide` of `match` to `nextSide` of `nextMatch`. */
export function setNextOpponent(
	nextMatch: MatchData,
	nextSide: Side,
	match?: MatchData,
	currentSide?: Side,
): void {
	nextMatch[nextSide] = match![currentSide!] && {
		// Keep BYE.
		id: getOpponentId(match!, currentSide!),
		position: nextMatch[nextSide]?.position,
	};
	nextMatch.winnerSide = null; // A match whose opponents changed can't keep its winner.
}

/** Resets an opponent in the match following the current one. */
export function resetNextOpponent(nextMatch: MatchData, nextSide: Side): void {
	nextMatch[nextSide] = nextMatch[nextSide] && {
		// Keep BYE.
		id: null,
		position: nextMatch[nextSide]?.position,
	};
	nextMatch.winnerSide = null; // A match whose opponents changed can't keep its winner.
}

/** Real number (after loser ordering) of a match in a loser bracket. */
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

/** Ordering method of a loser bracket round. */
export function getLoserOrdering(
	participantCount: number,
	roundNumber: number,
): SeedOrdering | undefined {
	return defaultMinorOrdering[participantCount]?.[Math.floor(roundNumber / 2)];
}

/** Match number of the corresponding match in the next round. */
export function getDiagonalMatchNumber(matchNumber: number): number {
	return Math.ceil(matchNumber / 2);
}

/** Whether a stage is round robin. */
export function isRoundRobin(stage: StageData): boolean {
	return stage.type === "round_robin";
}

/** Whether a stage is swiss. */
export function isSwiss(stage: StageData): boolean {
	return stage.type === "swiss";
}

/** Type of group a match is located in. */
export function getMatchLocation(
	stageType: StageType,
	groupNumber: number,
): GroupType {
	if (isWinnerBracket(stageType, groupNumber)) return "winner_bracket";

	if (isLoserBracket(stageType, groupNumber)) return "loser_bracket";

	if (isFinalGroup(stageType, groupNumber)) return "final_group";

	return "single_bracket";
}

function getSide(matchNumber: number): Side {
	return matchNumber % 2 === 1 ? "opponent1" : "opponent2";
}

/** `undefined` scores keep the current ones, `null` clears them. */
function setScores(
	stored: MatchResults,
	scores: MatchResultsInput["scores"],
): void {
	if (scores === undefined) return;

	if (stored.opponent1) stored.opponent1.score = scores?.[0];
	if (stored.opponent2) stored.opponent2.score = scores?.[1];
}

function getOpponentId(match: MatchResults, side: Side): number | null {
	const opponent = match[side];
	return opponent?.id ?? null;
}

function getLoserRoundMatchCount(
	participantCount: number,
	roundNumber: number,
): number {
	const roundPairIndex = Math.ceil(roundNumber / 2) - 1;
	const roundPairCount = Math.log2(participantCount) - 1;
	const matchCount = 2 ** (roundPairCount - roundPairIndex - 1);
	return matchCount;
}

function getLoserRoundLoserCount(
	participantCount: number,
	roundNumber: number,
): number {
	const matchCount = getLoserRoundMatchCount(participantCount, roundNumber);

	// Two per match for LB round 1 (losers coming from WB round 1).
	if (roundNumber === 1) return matchCount * 2;

	return matchCount; // One per match for LB minor rounds.
}

/** Not the opposite of `isLoserBracket()`: the only bracket of single elimination is neither. */
function isWinnerBracket(stageType: StageType, groupNumber: number): boolean {
	return stageType === "double_elimination" && groupNumber === 1;
}

function isLoserBracket(stageType: StageType, groupNumber: number): boolean {
	return stageType === "double_elimination" && groupNumber === 2;
}

/** Consolation final or grand final. */
function isFinalGroup(stageType: StageType, groupNumber: number): boolean {
	return (
		(stageType === "single_elimination" && groupNumber === 2) ||
		(stageType === "double_elimination" && groupNumber === 3)
	);
}
