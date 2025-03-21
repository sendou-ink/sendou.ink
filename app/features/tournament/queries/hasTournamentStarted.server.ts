import { sql } from "~/db/sql";
import type { Tables } from "~/db/tables";

const stm = sql.prepare(/*sql*/ `
  select 1
    from "TournamentStage"
    where "TournamentStage"."tournamentId" = @tournamentId
`);

export default function hasTournamentStarted(
	tournamentId: Tables["Tournament"]["id"],
) {
	return Boolean(stm.get({ tournamentId }));
}
