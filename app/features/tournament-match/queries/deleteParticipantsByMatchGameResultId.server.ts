import { sql } from "~/db/sql";

const stm = sql.prepare(/* sql */ `
  delete from "TournamentMatchGameResultParticipant"
  where "matchGameResultId" = @matchGameResultId
`);

export function deleteParticipantsByMatchGameResultId(
	matchGameResultId: number,
) {
	stm.run({ matchGameResultId });
}
