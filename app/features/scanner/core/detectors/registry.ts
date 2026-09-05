/** Every detector that runs on a frame; new event types register here. */

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

/** Event types whose data is the full 8-player ScoreboardData shape. */
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
