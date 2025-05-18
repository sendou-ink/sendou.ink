import { sql } from "~/db/sql";
import type { Tables } from "~/db/tables";

const stm = sql.prepare(/*sql*/ `
  select
    "stageId",
    "mode"
  from
    "MapPoolMap"
  where
    "tieBreakerCalendarEventId" = (
      select "id"
        from "CalendarEvent"
        where "tournamentId" = @tournamentId
    )
`);

export function findTieBreakerMapPoolByTournamentId(tournamentId: number) {
	return stm.all({ tournamentId }) as Array<
		Pick<Tables["MapPoolMap"], "stageId" | "mode">
	>;
}
