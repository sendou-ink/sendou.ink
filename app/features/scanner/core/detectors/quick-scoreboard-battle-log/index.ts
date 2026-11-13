/**
 * QuickScoreboardBattleLogDetector: parses the Recent Battles detail as the
 * lobby's quick view draws it (the menu overlay with the battle list on the
 * left) — the same fields as the full-screen battle log on a tighter layout.
 * Implementation shared in ../scoreboard-battle-log/detector.ts; only the
 * geometry (./rois.ts) is this screen's.
 */
import type { ScoreboardResources } from "../scoreboard/index";
import {
	battleLogEventKind,
	createBattleLogDetector,
} from "../scoreboard-battle-log/detector";
import type { Detector, EventOf } from "../types";
import { ROIS } from "./rois";

export const QUICK_SCOREBOARD_BATTLE_LOG_EVENT_TYPE =
	"QuickScoreboardBattleLog";

export const QUICK_SCOREBOARD_BATTLE_LOG_EVENT = battleLogEventKind(
	QUICK_SCOREBOARD_BATTLE_LOG_EVENT_TYPE,
);

export function createQuickScoreboardBattleLogDetector(
	resources: ScoreboardResources,
): Detector<EventOf<typeof QUICK_SCOREBOARD_BATTLE_LOG_EVENT>> {
	return createBattleLogDetector(resources, {
		id: "quick-scoreboard-battle-log",
		eventType: QUICK_SCOREBOARD_BATTLE_LOG_EVENT_TYPE,
		rois: ROIS,
	});
}
