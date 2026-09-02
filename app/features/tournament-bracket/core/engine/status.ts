import * as R from "remeda";
import type { TournamentRoundMaps } from "~/db/tables-json";
import type {
	BracketData,
	MatchData,
	MatchResults,
	RoundData,
	Side,
} from "./types";

/**
 * Never persisted, derived from the opponents and (round robin) the previous round's progress.
 * `PENDING`: an opponent is unknown, a BYE or the teams are busy in an earlier round.
 * `STARTED`: can be played, maybe in progress. `COMPLETED`: has a winner.
 */
export type MatchStatus = "PENDING" | "STARTED" | "COMPLETED";

/** Derives the status of every match of the bracket, keyed by match id. */
export function matchStatuses(data: BracketData): Map<number, MatchStatus> {
	const context = bracketContext(data);

	return new Map(
		data.match.map((match) => [match.id, resolveStatus(match, context)]),
	);
}

/** Prefer {@link matchStatuses} when many matches of the same bracket are needed. */
export function matchStatus(data: BracketData, matchId: number): MatchStatus {
	const match = data.match.find((match) => match.id === matchId);
	if (!match) throw new Error(`Match not found: ${matchId}`);

	return resolveStatus(match, bracketContext(data));
}

/** Whether at least one game has been reported. */
export function isMatchStarted(match: MatchResults): boolean {
	return (
		match.opponent1?.score !== undefined || match.opponent2?.score !== undefined
	);
}

/** Whether the match is completed. */
export function isMatchCompleted(match: MatchResults): boolean {
	return isMatchByeCompleted(match) || Boolean(match.winnerSide);
}

/** Whether the match is completed because of a BYE. "BYE vs. TBD" isn't completed yet. */
export function isMatchByeCompleted(match: MatchResults): boolean {
	return (
		(match.opponent1 === null && match.opponent2?.id !== null) || // BYE vs. someone
		(match.opponent2 === null && match.opponent1?.id !== null) || // someone vs. BYE
		(match.opponent1 === null && match.opponent2 === null)
	); // BYE vs. BYE
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

/** `undefined` while the set is not over (or a play all set ended in a tie). */
export function winnerSideByScore(args: {
	scores: [number, number];
	count: number;
	countType: TournamentRoundMaps["type"];
}): Side | undefined {
	if (!isSetOverByScore(args)) return undefined;

	const [scoreOne, scoreTwo] = args.scores;
	if (scoreOne > scoreTwo) return "opponent1";
	if (scoreTwo > scoreOne) return "opponent2";

	return undefined;
}

/** Completed before the games decided the set (e.g. organizer force-ending it). */
export function matchEndedEarly({
	opponentOne,
	opponentTwo,
	winnerSide,
	count,
	countType,
}: {
	opponentOne: { score?: number } | null;
	opponentTwo: { score?: number } | null;
	winnerSide: Side | null;
	count: number;
	countType: TournamentRoundMaps["type"];
}) {
	if (!winnerSide) return false;

	const scores: [number, number] = [
		opponentOne?.score ?? 0,
		opponentTwo?.score ?? 0,
	];

	return !isSetOverByScore({ scores, count, countType });
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

	// a match being played can't go back to pending e.g. by an earlier match being reopened (issue #2690)
	if (isMatchStarted(match)) return "STARTED";

	if (isWaitingForPreviousRound(match, context)) return "PENDING";

	return "STARTED";
}

/** Non-independent round robin: opponents are known from the start but play only once done with the previous round. */
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
