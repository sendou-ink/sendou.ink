/**
 * ScoreboardBattleLogDetector: parses the full-screen Recent Battles detail
 * (the menu's battle log). Implementation shared with the lobby's quick view
 * in ./detector.ts; only the geometry (./rois.ts) is this screen's.
 */
import type { ScoreboardResources } from "../scoreboard/index";
import type { Detector } from "../types";
import {
	createBattleLogDetector,
	type ScoreboardBattleLogData,
} from "./detector";
import { ROIS } from "./rois";

export type { ScoreboardBattleLogData } from "./detector";

export const SCOREBOARD_BATTLE_LOG_EVENT_TYPE = "ScoreboardBattleLog";

export function createScoreboardBattleLogDetector(
	resources: ScoreboardResources,
): Detector<ScoreboardBattleLogData> {
	return createBattleLogDetector(resources, {
		id: "scoreboard-battle-log",
		eventType: SCOREBOARD_BATTLE_LOG_EVENT_TYPE,
		rois: ROIS,
	});
}
