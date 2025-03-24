import { sql } from "~/db/sql";
import type { Tables } from "~/db/tables";

const stm = sql.prepare(/*sql*/ `
  select 1
    from "TournamentResult"
    where "TournamentResult"."tournamentId" = @tournamentId
`);

export default function hasTournamentFinalized(
	tournamentId: Tables["Tournament"]["id"],
) {
	return Boolean(stm.get({ tournamentId }));
}
