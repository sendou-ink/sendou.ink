import { sql } from "~/db/sql";

const stm = sql.prepare(/* sql */ `
  delete from "TournamentMatchPickBanEvent"
    where "matchId" = @matchId
    and "number" = @number
`);

export function deletePickBanEvent({
	matchId,
	number,
}: {
	matchId: number;
	number: number;
}) {
	return stm.run({ matchId, number });
}
