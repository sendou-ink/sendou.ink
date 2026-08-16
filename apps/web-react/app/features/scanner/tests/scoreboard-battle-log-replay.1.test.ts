/**
 * Shard 1/2 of the replay suite — see
 * tests/suites/scoreboard-battle-log-replay.ts.
 */
import { runScoreboardBattleLogReplaySuite } from "./suites/scoreboard-battle-log-replay";

await runScoreboardBattleLogReplaySuite(0, 2);
