import { sql } from "~/db/sql";

const stm = sql.prepare(/* sql */ `
  update "TournamentMatch"
  set
    "status" = 0,
    "startedAt" = null
  where "id" = @matchId
`);

export function resetMatchStatus(matchId: number) {
	stm.run({ matchId });
}
