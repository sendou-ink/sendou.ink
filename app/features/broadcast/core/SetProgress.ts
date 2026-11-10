import * as Engine from "~/features/tournament-bracket/core/engine";
import type { ModeShort, StageId } from "~/modules/in-game-lists/types";
import type {
	BroadcastGame,
	BroadcastMap,
	BroadcastMatch,
	LiveResults,
	MatchProgress,
} from "../broadcast-types";

interface Result {
	winnerTeamId: number;
	mode: ModeShort;
	stageId: StageId;
}

/**
 * How far the set is after its first `resultCount` results (capped to the reported ones). A game already
 * reported shows the map it was played on, the ones after the last report the map list's maps.
 */
export function atResultCount({
	results,
	resultCount,
	teamIds,
	bracketScores,
	isSetOver,
	plannedMaps,
	gameCount,
}: {
	/** In playing order. */
	results: Result[];
	resultCount: number;
	/** In bracket order. */
	teamIds: [number | null, number | null];
	/** As the bracket has them, used once every result is counted (an admin can end a set with a score of their own). */
	bracketScores: [number, number];
	isSetOver: boolean;
	/** The set's map list without the banned maps, in playing order, as far as it is known. */
	plannedMaps: BroadcastMap[];
	/** How many games the set can have at most, e.g. 5 for a Bo5. */
	gameCount: number;
}): MatchProgress {
	const count = Math.min(Math.max(resultCount, 0), results.length);
	const counted = results.slice(0, count);
	const isOver = isSetOver && count === results.length;
	const nextGame = results[count];

	const games: BroadcastGame[] = Array.from(
		{ length: Math.max(gameCount, results.length) },
		(_, i) => {
			const result = counted[i];
			if (result) {
				return {
					map: { mode: result.mode, stageId: result.stageId },
					winner: result.winnerTeamId === teamIds[0] ? 0 : 1,
				};
			}

			const played = results[i];
			const planned = played
				? { mode: played.mode, stageId: played.stageId }
				: plannedMaps[i];

			return { map: isOver ? null : (planned ?? null), winner: null };
		},
	);

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
				: (plannedMaps[count] ?? null),
		games,
	};
}

/**
 * The set's games without the ones it ended before: those after the game a team clinched it in, or every unplayed one
 * once the set is over (an admin can end it early). The game being played counts as won by `currentWinner`, its
 * result being known before it is reported.
 */
export function gamesUntilDecided({
	progress,
	match,
	currentWinner,
}: {
	progress: MatchProgress;
	match: Pick<BroadcastMatch, "count" | "countType">;
	currentWinner: 0 | 1 | null;
}): BroadcastGame[] {
	const scores: [number, number] = [0, 0];

	for (const [i, game] of progress.games.entries()) {
		const gameWinner =
			game.winner ?? (i + 1 === progress.gameNumber ? currentWinner : null);
		if (gameWinner === null) {
			return progress.isOver ? progress.games.slice(0, i) : progress.games;
		}

		scores[gameWinner]++;
		if (
			Engine.isSetOverByScore({
				scores,
				count: match.count,
				countType: match.countType,
			})
		) {
			return progress.games.slice(0, i + 1);
		}
	}

	return progress.games;
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

/** Index of the team (in bracket order) that won the set, `null` while it is going. */
export function winner(progress: Pick<MatchProgress, "scores" | "isOver">) {
	if (!progress.isOver || progress.scores[0] === progress.scores[1]) {
		return null;
	}

	return progress.scores[0] > progress.scores[1] ? 0 : 1;
}

function score(results: Result[], teamId: number | null) {
	if (teamId === null) return 0;

	return results.filter((result) => result.winnerTeamId === teamId).length;
}
