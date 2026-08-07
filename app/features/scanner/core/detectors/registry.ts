/**
 * The full detector registry — the single source of truth for "every
 * detector that runs on a frame". New event types get added here and are
 * picked up by the analyzer worker.
 */

import { createDeathDetector } from "./death/index";
import { createMapStartDetector } from "./map-start/index";
import { createMinimapDetector } from "./minimap/index";
import { createObjectiveDetector } from "./objective/index";
import {
	createScoreboardDetector,
	SCOREBOARD_EVENT_TYPE,
	type ScoreboardResources,
} from "./scoreboard/index";
import {
	createScoreboardBattleLogDetector,
	SCOREBOARD_BATTLE_LOG_EVENT_TYPE,
} from "./scoreboard-battle-log/index";
import {
	createScoreboardBattleLogReplayDetector,
	SCOREBOARD_BATTLE_LOG_REPLAY_EVENT_TYPE,
} from "./scoreboard-battle-log-replay/index";
import { createScoreboardOwnDetector } from "./scoreboard-own/index";
import type { Detector } from "./types";

/**
 * Event types whose data is the full 8-player scoreboard shape
 * (ScoreboardData): the results screen, the replay-browser detail, and the
 * scoreboard-battle-log detail.
 */
export const SCOREBOARD_EVENT_TYPES: readonly string[] = [
	SCOREBOARD_EVENT_TYPE,
	SCOREBOARD_BATTLE_LOG_REPLAY_EVENT_TYPE,
	SCOREBOARD_BATTLE_LOG_EVENT_TYPE,
];

export function createAllDetectors(
	resources: ScoreboardResources,
): Detector<unknown>[] {
	return [
		createScoreboardDetector(resources) as Detector<unknown>,
		createScoreboardBattleLogReplayDetector(resources) as Detector<unknown>,
		createScoreboardBattleLogDetector(resources) as Detector<unknown>,
		createScoreboardOwnDetector(resources) as Detector<unknown>,
		createDeathDetector(resources) as Detector<unknown>,
		createMapStartDetector(resources) as Detector<unknown>,
		createMinimapDetector(resources) as Detector<unknown>,
		createObjectiveDetector(resources) as Detector<unknown>,
	];
}
