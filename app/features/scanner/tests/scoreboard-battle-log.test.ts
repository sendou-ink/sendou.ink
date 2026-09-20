/** The full-screen Recent Battles detail — see tests/suites/scoreboard-battle-log.ts. */
import {
	createScoreboardBattleLogDetector,
	SCOREBOARD_BATTLE_LOG_EVENT_TYPE,
} from "../core/detectors/scoreboard-battle-log/index";
import { runScoreboardBattleLogSuite } from "./suites/scoreboard-battle-log";

await runScoreboardBattleLogSuite({
	fixturesDir: "scoreboard-battle-log",
	eventType: SCOREBOARD_BATTLE_LOG_EVENT_TYPE,
	createDetector: createScoreboardBattleLogDetector,
});
