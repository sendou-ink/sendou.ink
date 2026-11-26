import type { BracketData } from "./types";

/**
 * Full round counts of an elimination group's winners and losers sections, skipped (never created) rounds included,
 * so they can't be read off the stored rounds. Derived from the winners section's first round. 0 for a group without one.
 */
export function eliminationRoundCounts(
	data: BracketData,
	groupId: number,
): { winners: number; losers: number } {
	const firstRound = data.round.find(
		(round) =>
			round.groupId === groupId &&
			round.section === "winners" &&
			round.number === 1,
	);
	if (!firstRound) return { winners: 0, losers: 0 };

	const firstRoundMatchCount = data.match.filter(
		(match) => match.roundId === firstRound.id,
	).length;
	const winners = Math.log2(firstRoundMatchCount * 2);

	return { winners, losers: Math.max(0, (winners - 1) * 2) };
}

/** The losers round the loser of the given winners round drops to. */
export function losersRoundOfWinnersRound(winnersRoundNumber: number): number {
	return winnersRoundNumber > 1 ? (winnersRoundNumber - 1) * 2 : 1;
}
