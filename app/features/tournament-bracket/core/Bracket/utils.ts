import * as R from "remeda";
import type { TournamentManagerDataSet } from "~/features/tournament-bracket/core/engine/types";

/**
 * Maps each round_id to the cumulative number of teams eliminated by the end of
 * that round, counting one elimination per non-bye match. This is a structural
 * property of the bracket that does not depend on which matches have already
 * been reported, so teams tied at the same placement resolve to the same
 * placement even while some of their round's matches are still in progress.
 */
export function cumulativeEliminationsByRound(
	matches: TournamentManagerDataSet["match"],
): Map<number, number> {
	const result = new Map<number, number>();

	const roundIds = R.unique(matches.map((match) => match.round_id)).sort(
		(a, b) => a - b,
	);

	let cumulativeEliminations = 0;
	for (const roundId of roundIds) {
		const eliminationsThisRound = matches.filter(
			(match) =>
				match.round_id === roundId && match.opponent1 && match.opponent2,
		).length;
		cumulativeEliminations += eliminationsThisRound;
		result.set(roundId, cumulativeEliminations);
	}

	return result;
}
