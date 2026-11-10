import * as R from "remeda";
import type { BracketData, MatchData } from "./engine/types";
import type { getRounds } from "./rounds";

type Rounds = Pick<ReturnType<typeof getRounds>[number], "id">[];

/**
 * How one side of an elimination bracket is laid out. Compactified hides the rounds with no match left to play
 * (every match decided or a bye), always keeping the side's last two rounds. Independently of that, the first round
 * is compacted when it can be, see {@link matchesOfRound}.
 */
export function resolve({
	rounds,
	bracketData,
	isCompactified,
}: {
	rounds: Rounds;
	bracketData: BracketData;
	isCompactified: boolean;
}) {
	const hiddenRoundIds = new Set(
		isCompactified
			? rounds
					.filter(
						(round, roundIdx) =>
							roundIdx < rounds.length - 2 &&
							!matchesOfRoundId(bracketData, round.id).some(isLeftToPlay),
					)
					.map((round) => round.id)
			: [],
	);

	return {
		hiddenRoundIds,
		compactedFirstRoundId: resolveCompactedFirstRoundId({
			rounds,
			firstVisibleRoundId: rounds.find((round) => !hiddenRoundIds.has(round.id))
				?.id,
			bracketData,
		}),
	};
}

/**
 * Matches of the round as laid out. Of a compacted first round only one match per pair: the one played, or the
 * first of a pair where neither is.
 */
export function matchesOfRound({
	roundId,
	bracketData,
	compactedFirstRoundId,
}: {
	roundId: number;
	bracketData: BracketData;
	compactedFirstRoundId: number | null;
}) {
	const matches = matchesOfRoundId(bracketData, roundId);
	if (roundId !== compactedFirstRoundId) return matches;

	return R.chunk(matches, 2).map(
		(pair) =>
			pair.find((match) => match.opponent1 && match.opponent2) ?? pair[0],
	);
}

function matchesOfRoundId(bracketData: BracketData, roundId: number) {
	return bracketData.match.filter((match) => match.roundId === roundId);
}

function isLeftToPlay(match: MatchData) {
	return Boolean(match.opponent1 && match.opponent2 && !match.winnerSide);
}

/**
 * Compacted = one first round slot per second round match instead of two, halving the height. Possible
 * when fewer than half of the potential first round matches are played, as then each second round match
 * has at most one feeder that can sit right next to it with a straight connector.
 */
function resolveCompactedFirstRoundId(args: {
	rounds: Rounds;
	firstVisibleRoundId?: number;
	bracketData: BracketData;
}): number | null {
	const [firstRound, secondRound] = args.rounds;
	if (!firstRound || !secondRound) return null;
	if (firstRound.id !== args.firstVisibleRoundId) return null;

	const firstRoundMatches = matchesOfRoundId(args.bracketData, firstRound.id);
	const secondRoundMatchCount = matchesOfRoundId(
		args.bracketData,
		secondRound.id,
	).length;
	if (firstRoundMatches.length !== secondRoundMatchCount * 2) return null;

	const playedMatchCount = firstRoundMatches.filter(
		(match) => match.opponent1 && match.opponent2,
	).length;
	if (playedMatchCount > firstRoundMatches.length / 2) return null;

	const everyPairHasAtMostOnePlayedMatch = R.chunk(firstRoundMatches, 2).every(
		(pair) =>
			pair.filter((match) => match.opponent1 && match.opponent2).length <= 1,
	);
	if (!everyPairHasAtMostOnePlayedMatch) return null;

	return firstRound.id;
}
