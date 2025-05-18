import { sql } from "~/db/sql";
import type { Tables } from "~/db/tables";

const stm = sql.prepare(/* sql */ `
  delete from "TournamentSub"
  where
    "userId" = @userId and
    "tournamentId" = @tournamentId
`);

export function deleteSub(
	args: Pick<Tables["TournamentSub"], "userId" | "tournamentId">,
) {
	stm.run(args);
}
