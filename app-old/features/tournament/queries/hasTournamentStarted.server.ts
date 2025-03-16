import { sql } from "~/db/sql";
import type { Tournament } from "~/db/types";

const stm = sql.prepare(/*sql*/ `
  select 1
    from "TournamentStage"
    where "TournamentStage"."tournamentId" = @tournamentId
`);

export default function hasTournamentStarted(tournamentId: Tournament["id"]) {
	return Boolean(stm.get({ tournamentId }));
}
