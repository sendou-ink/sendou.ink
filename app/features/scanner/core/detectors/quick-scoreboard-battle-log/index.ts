/**
 * QuickScoreboardBattleLogDetector: parses the Recent Battles detail as the
 * lobby's quick view draws it (the menu overlay with the battle list on the
 * left) — the same fields as the full-screen battle log on a tighter layout.
 * Implementation shared in ../scoreboard-battle-log/detector.ts; only the
 * geometry (./rois.ts) is this screen's.
 */
import type { ScoreboardResources } from "../scoreboard/index";
import {
	createBattleLogDetector,
	type ScoreboardBattleLogData,
} from "../scoreboard-battle-log/detector";
import type { Detector } from "../types";
import { ROIS } from "./rois";

export const QUICK_SCOREBOARD_BATTLE_LOG_EVENT_TYPE =
	"QuickScoreboardBattleLog";

export function createQuickScoreboardBattleLogDetector(
	resources: ScoreboardResources,
): Detector<ScoreboardBattleLogData> {
	return createBattleLogDetector(resources, {
		id: "quick-scoreboard-battle-log",
		eventType: QUICK_SCOREBOARD_BATTLE_LOG_EVENT_TYPE,
		rois: ROIS,
	});
}
