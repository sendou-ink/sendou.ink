import type {
	BroadcastMap,
	BroadcastMatch,
	BroadcastScene,
	MatchProgress,
} from "../broadcast-types";
import * as SetProgress from "./SetProgress";

export type Content =
	/** The game about to be played. */
	| {
			kind: "game";
			gameNumber: number;
			map: BroadcastMap | null;
			stakes: "match-point" | "final-game" | null;
	  }
	/** The finished set. `winner` is in bracket order, `null` for a play all set that ended in a tie. */
	| { kind: "result"; winner: 0 | 1 | null }
	/** The teams facing each other. */
	| { kind: "matchup" }
	/** Only the scene, nothing about the match. */
	| { kind: "scene"; scene: BroadcastScene };

const GAME_SCENES = new Set<BroadcastScene>(["game", "maps"]);
const MATCHUP_SCENES = new Set<BroadcastScene>(["rosters", "casters"]);

/** What the stinger leading into the scene headlines, from the match as the incoming state shows it. */
export function resolve({
	scene,
	match,
	progress,
}: {
	scene: BroadcastScene;
	match: Pick<BroadcastMatch, "countType" | "count"> | null;
	progress: MatchProgress | null;
}): Content {
	if (!match || !progress) return { kind: "scene", scene };

	if (progress.isOver && scene !== "ending") {
		return { kind: "result", winner: SetProgress.winner(progress) };
	}

	if (GAME_SCENES.has(scene)) {
		return {
			kind: "game",
			gameNumber: progress.gameNumber,
			map: progress.currentMap,
			stakes: stakes(match, progress),
		};
	}

	if (MATCHUP_SCENES.has(scene)) return { kind: "matchup" };

	return { kind: "scene", scene };
}

function stakes(
	match: Pick<BroadcastMatch, "countType" | "count">,
	progress: MatchProgress,
) {
	if (progress.gameNumber === match.count) return "final-game";

	const [one, two] = SetProgress.isOnMatchPoint(match, progress);
	return one || two ? "match-point" : null;
}
