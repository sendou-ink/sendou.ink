import type { ModeShort, StageId } from "~/modules/in-game-lists/types";
import type { LiveResults, MatchProgress } from "../broadcast-types";

interface Result {
	winnerTeamId: number;
	mode: ModeShort;
	stageId: StageId;
}

/**
 * How far the set is after its first `resultCount` results (capped to the reported ones). A game already
 * reported shows the map it was played on, the one after the last report the map list's next map.
 */
export function atResultCount({
	results,
	resultCount,
	teamIds,
	bracketScores,
	isSetOver,
	upcomingMap,
}: {
	/** In playing order. */
	results: Result[];
	resultCount: number;
	/** In bracket order. */
	teamIds: [number | null, number | null];
	/** As the bracket has them, used once every result is counted (an admin can end a set with a score of their own). */
	bracketScores: [number, number];
	isSetOver: boolean;
	/** Map of the game after the last reported one. */
	upcomingMap: MatchProgress["currentMap"];
}): MatchProgress {
	const count = Math.min(Math.max(resultCount, 0), results.length);
	const counted = results.slice(0, count);
	const isOver = isSetOver && count === results.length;
	const nextGame = results[count];

	return {
		resultCount: count,
		scores:
			count === results.length
				? bracketScores
				: [score(counted, teamIds[0]), score(counted, teamIds[1])],
		isOver,
		gameNumber: isOver ? Math.max(count, 1) : count + 1,
		currentMap: isOver
			? null
			: nextGame
				? { mode: nextGame.mode, stageId: nextGame.stageId }
				: upcomingMap,
	};
}

/** How many of the match's results are on air: what the last Take or "show now" put there, all of them for a match not taken yet. */
export function liveResultCount({
	liveResults,
	matchId,
	resultCount,
}: {
	liveResults: LiveResults | null;
	matchId: number;
	resultCount: number;
}) {
	if (liveResults?.matchId !== matchId) return resultCount;

	return Math.min(liveResults.count, resultCount);
}

function score(results: Result[], teamId: number | null) {
	if (teamId === null) return 0;

	return results.filter((result) => result.winnerTeamId === teamId).length;
}
