/** The lobby's quick Recent Battles detail — see tests/suites/scoreboard-battle-log.ts. */
import {
	createQuickScoreboardBattleLogDetector,
	QUICK_SCOREBOARD_BATTLE_LOG_EVENT_TYPE,
} from "../core/detectors/quick-scoreboard-battle-log/index";
import { runScoreboardBattleLogSuite } from "./suites/scoreboard-battle-log";

await runScoreboardBattleLogSuite({
	fixturesDir: "quick-scoreboard-battle-log",
	eventType: QUICK_SCOREBOARD_BATTLE_LOG_EVENT_TYPE,
	createDetector: createQuickScoreboardBattleLogDetector,
});
