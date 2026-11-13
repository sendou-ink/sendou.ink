/** Every detector that runs on a frame; new event types register here. */

import type { DetectedEvent } from "../events";
import { createDeathDetector } from "./death/index";
import { createKillDetector } from "./kill/index";
import { createMapStartDetector } from "./map-start/index";
import { createMinimapDetector } from "./minimap/index";
import { createObjectiveDetector } from "./objective/index";
import { createQuickScoreboardBattleLogDetector } from "./quick-scoreboard-battle-log/index";
import {
	createScoreboardDetector,
	type ScoreboardResources,
} from "./scoreboard/index";
import { createScoreboardBattleLogDetector } from "./scoreboard-battle-log/index";
import { createScoreboardBattleLogReplayDetector } from "./scoreboard-battle-log-replay/index";
import { createScoreboardOwnDetector } from "./scoreboard-own/index";
import type { Detector } from "./types";
import { createXRankPositionDetector } from "./x-rank/position";
import { createXSetCountDetector } from "./x-rank/set-count";
import { createXSetResultDetector } from "./x-rank/set-result";

export function createAllDetectors(
	resources: ScoreboardResources,
): Detector<DetectedEvent>[] {
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
