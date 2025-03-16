import { sql } from "~/db/sql";
import type { MapPoolMap } from "~/db/types";

const stm = sql.prepare(/*sql*/ `
  select
    "MapPoolMap"."stageId",
    "MapPoolMap"."mode"
  from "TournamentTeam"
  inner join "MapPoolMap" on "MapPoolMap"."tournamentTeamId" = "TournamentTeam"."id"
  where
    "TournamentTeam"."id" = @teamId
`);

export function findMapPoolByTeamId(teamId: number) {
	return stm.all({ teamId }) as Array<Pick<MapPoolMap, "stageId" | "mode">>;
}
