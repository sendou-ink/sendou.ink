/** Shard 1/2 of the replay suite — see tests/suites/scoreboard-replay.ts. */
import { runScoreboardReplaySuite } from "./suites/scoreboard-replay";

await runScoreboardReplaySuite(0, 2);
