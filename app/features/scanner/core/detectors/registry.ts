/** Every detector that runs on a frame; new event types register here. */

import { createDeathDetector } from "./death/index";
import { createKillDetector } from "./kill/index";
import { createMapStartDetector } from "./map-start/index";
import { createMinimapDetector } from "./minimap/index";
import { createObjectiveDetector } from "./objective/index";
import {
	createQuickScoreboardBattleLogDetector,
	QUICK_SCOREBOARD_BATTLE_LOG_EVENT_TYPE,
} from "./quick-scoreboard-battle-log/index";
import {
	createScoreboardBattleLogReplayDetector,
	SCOREBOARD_BATTLE_LOG_REPLAY_EVENT_TYPE,
} from "./scoreboard-battle-log-replay/index";
import {
	createScoreboardBattleLogDetector,
	SCOREBOARD_BATTLE_LOG_EVENT_TYPE,
} from "./scoreboard-battle-log/index";
import { createScoreboardOwnDetector } from "./scoreboard-own/index";
import {
	createScoreboardDetector,
	SCOREBOARD_EVENT_TYPE,
	type ScoreboardResources,
} from "./scoreboard/index";
import type { Detector } from "./types";
import { createXRankPositionDetector } from "./x-rank/position";
import { createXSetCountDetector } from "./x-rank/set-count";
import { createXSetResultDetector } from "./x-rank/set-result";

/** Event types whose data is the full 8-player ScoreboardData shape. */
export const SCOREBOARD_EVENT_TYPES: readonly string[] = [
	SCOREBOARD_EVENT_TYPE,
	SCOREBOARD_BATTLE_LOG_REPLAY_EVENT_TYPE,
	SCOREBOARD_BATTLE_LOG_EVENT_TYPE,
	QUICK_SCOREBOARD_BATTLE_LOG_EVENT_TYPE,
];

export function createAllDetectors(
	resources: ScoreboardResources,
): Detector<unknown>[] {
	return [
		createScoreboardDetector(resources),
		createScoreboardBattleLogReplayDetector(resources),
		createScoreboardBattleLogDetector(resources),
		createQuickScoreboardBattleLogDetector(resources),
		createScoreboardOwnDetector(resources),
		createDeathDetector(resources),
		createMapStartDetector(resources),
		createMinimapDetector(resources),
		createObjectiveDetector(resources),
		createKillDetector(resources),
		createXSetCountDetector(resources),
		createXSetResultDetector(resources),
		createXRankPositionDetector(resources),
	];
}
