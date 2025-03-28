import { sql } from "~/db/sql";
import type { Tables } from "~/db/tables";

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
	return stm.all({ teamId }) as Array<
		Pick<Tables["MapPoolMap"], "stageId" | "mode">
	>;
}
