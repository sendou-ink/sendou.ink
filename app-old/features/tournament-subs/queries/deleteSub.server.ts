import { sql } from "~/db/sql";
import type { TournamentSub } from "~/db/types";

const stm = sql.prepare(/* sql */ `
  delete from "TournamentSub"
  where
    "userId" = @userId and
    "tournamentId" = @tournamentId
`);

export function deleteSub(
	args: Pick<TournamentSub, "userId" | "tournamentId">,
) {
	stm.run(args);
}
