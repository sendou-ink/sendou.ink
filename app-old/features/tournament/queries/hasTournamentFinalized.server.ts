import { sql } from "~/db/sql";
import type { Tournament } from "~/db/types";

const stm = sql.prepare(/*sql*/ `
  select 1
    from "TournamentResult"
    where "TournamentResult"."tournamentId" = @tournamentId
`);

export default function hasTournamentFinalized(tournamentId: Tournament["id"]) {
	return Boolean(stm.get({ tournamentId }));
}
