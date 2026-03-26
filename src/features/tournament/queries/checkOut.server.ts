import { sql } from "~/db/sql";

const stm = sql.prepare(/* sql */ `
  delete from "TournamentTeamCheckIn"
    where "tournamentTeamId" = @tournamentTeamId
`);

export function checkOut(tournamentTeamId: number) {
	stm.run({ tournamentTeamId });
}
