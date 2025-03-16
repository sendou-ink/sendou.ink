import { sql } from "~/db/sql";
import type { PlayerResult } from "~/db/types";

const addPlayerResultDeltaStm = sql.prepare(/* sql */ `
  insert into "PlayerResult" (
    "ownerUserId",
    "otherUserId",
    "mapWins",
    "mapLosses",
    "setWins",
    "setLosses",
    "type",
    "season"
  ) values (
    @ownerUserId,
    @otherUserId,
    @mapWins,
    @mapLosses,
    @setWins,
    @setLosses,
    @type,
    @season
  ) on conflict ("ownerUserId", "otherUserId", "type", "season") do
  update
  set
    "mapWins" = "mapWins" + @mapWins,
    "mapLosses" = "mapLosses" + @mapLosses,
    "setWins" = "setWins" + @setWins,
    "setLosses" = "setLosses" + @setLosses
`);

export function addPlayerResults(results: Array<PlayerResult>) {
	for (const result of results) {
		addPlayerResultDeltaStm.run({
			ownerUserId: result.ownerUserId,
			otherUserId: result.otherUserId,
			mapWins: result.mapWins,
			mapLosses: result.mapLosses,
			setWins: result.setWins,
			setLosses: result.setLosses,
			type: result.type,
			season: result.season,
		});
	}
}
