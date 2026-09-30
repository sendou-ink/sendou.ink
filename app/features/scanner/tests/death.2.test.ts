/** Shard 2/3 of the death suite — see tests/suites/death.ts. */
import { runDeathSuite } from "./suites/death";

await runDeathSuite(1, 3);
