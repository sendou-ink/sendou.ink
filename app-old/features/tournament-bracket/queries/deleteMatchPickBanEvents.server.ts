import { sql } from "~/db/sql";

const stm = sql.prepare(/* sql */ `
  delete from "TournamentMatchPickBanEvent"
    where "matchId" = @matchId
`);

export function deleteMatchPickBanEvents({ matchId }: { matchId: number }) {
	return stm.run({ matchId });
}
