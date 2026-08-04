import type { BracketData, DroppedTeamsResult } from "../types";
import { Store } from "./store";
import { Propagator } from "./traversal";

/**
 * Ends all unfinished matches involving dropped teams by awarding wins to
 * their opponents. Ported from tournament-utils.server.ts. When both teams in
 * a match have dropped, a random winner is picked.
 *
 * Matches that only gain a dropped opponent through propagation caused by this
 * call are not ended (same as the old implementation, which iterated a
 * snapshot); they are picked up by the next call.
 */
export function endDroppedTeamMatches(
	data: BracketData,
	droppedTeamIds: number[],
): DroppedTeamsResult {
	const store = new Store(data);
	const propagator = new Propagator(store);
	const droppedTeamIdsSet = new Set(droppedTeamIds);

	const endedMatchIds: number[] = [];

	for (const match of data.match) {
		if (!match.opponent1?.id || !match.opponent2?.id) continue;
		if (match.winnerSide) continue;

		const team1Dropped = droppedTeamIdsSet.has(match.opponent1.id);
		const team2Dropped = droppedTeamIdsSet.has(match.opponent2.id);

		if (!team1Dropped && !team2Dropped) continue;

		const winnerTeamId = (() => {
			if (team1Dropped && !team2Dropped) return match.opponent2.id;
			if (!team1Dropped && team2Dropped) return match.opponent1.id;
			return Math.random() < 0.5 ? match.opponent1.id : match.opponent2.id;
		})();

		const stored = store.matchById(match.id);
		if (!stored) throw Error("Match not found.");

		propagator.updateMatch(
			stored,
			{
				winnerSide:
					winnerTeamId === match.opponent1.id ? "opponent1" : "opponent2",
			},
			true,
		);

		endedMatchIds.push(match.id);
	}

	return {
		data: store.data,
		changedMatches: store.changedMatches(),
		endedMatchIds,
	};
}
