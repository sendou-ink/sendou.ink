import type { BracketData, DroppedTeamsResult } from "../types";
import { Store } from "./store";
import { Propagator } from "./traversal";

/**
 * Ends unfinished matches of dropped teams by awarding wins to their opponents (random winner when both
 * dropped). Repeats for the matches the ended ones move a dropped team to, until none is left to play.
 */
export function endDroppedTeamMatches(
	data: BracketData,
	droppedTeamIds: number[],
): DroppedTeamsResult {
	const store = new Store(data);
	const propagator = new Propagator(store);
	const droppedTeamIdsSet = new Set(droppedTeamIds);

	const endedMatchIds: number[] = [];

	let endedOnThisPass = true;
	while (endedOnThisPass) {
		endedOnThisPass = false;

		for (const match of store.data.match) {
			if (!match.opponent1?.id || !match.opponent2?.id) continue;
			if (match.winnerSide) continue;

			const team1Dropped = droppedTeamIdsSet.has(match.opponent1.id);
			const team2Dropped = droppedTeamIdsSet.has(match.opponent2.id);

			if (!team1Dropped && !team2Dropped) continue;

			const winnerSide = (() => {
				if (team1Dropped && !team2Dropped) return "opponent2";
				if (!team1Dropped && team2Dropped) return "opponent1";
				return Math.random() < 0.5 ? "opponent1" : "opponent2";
			})();

			propagator.updateMatch(match, { winnerSide }, true);

			endedMatchIds.push(match.id);
			endedOnThisPass = true;
		}
	}

	return {
		data: store.data,
		changedMatches: store.changedMatches(),
		endedMatchIds,
	};
}
