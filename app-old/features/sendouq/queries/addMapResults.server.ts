import { sql } from "~/db/sql";
import type { MapResult } from "~/db/types";

const addMapResultDeltaStm = sql.prepare(/* sql */ `
  insert into "MapResult" (
    "mode",
    "stageId",
    "userId",
    "wins",
    "losses",
    "season"
  ) values (
    @mode,
    @stageId,
    @userId,
    @wins,
    @losses,
    @season
  ) on conflict ("userId", "stageId", "mode", "season") do
  update
  set
    "wins" = "wins" + @wins,
    "losses" = "losses" + @losses
`);

export function addMapResults(
	results: Array<
		Pick<MapResult, "losses" | "wins" | "userId" | "mode" | "stageId">
	>,
) {
	for (const result of results) {
		addMapResultDeltaStm.run(result);
	}
}
