import { sql } from "~/db/sql";

const stm = sql.prepare(/* sql */ `
  delete from "TournamentMatchGameResult"
  where "TournamentMatchGameResult"."id" = @id
`);

export function deleteTournamentMatchGameResultById(id: number) {
	stm.run({ id });
}
