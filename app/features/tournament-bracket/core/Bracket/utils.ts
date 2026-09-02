import * as R from "remeda";
import type { BracketData } from "~/features/tournament-bracket/core/engine/types";

/**
 * roundId -> teams eliminated by the end of that round (one per non-bye match). Structural, independent
 * of reported matches, so tied teams resolve to the same placement while their round is in progress.
 */
export function cumulativeEliminationsByRound(
	matches: BracketData["match"],
): Map<number, number> {
	const result = new Map<number, number>();

	const roundIds = R.unique(matches.map((match) => match.roundId)).sort(
		(a, b) => a - b,
	);

	let cumulativeEliminations = 0;
	for (const roundId of roundIds) {
		const eliminationsThisRound = matches.filter(
			(match) =>
				match.roundId === roundId && match.opponent1 && match.opponent2,
		).length;
		cumulativeEliminations += eliminationsThisRound;
		result.set(roundId, cumulativeEliminations);
	}

	return result;
}
