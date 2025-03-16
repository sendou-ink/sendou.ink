import { sql } from "~/db/sql";

const stm = sql.prepare(/* sql */ `
  insert into "TournamentTeamCheckIn" 
    ("tournamentTeamId", "checkedInAt")
  values 
    (@tournamentTeamId, strftime('%s', 'now'))
`);

export function checkIn(tournamentTeamId: number) {
	stm.run({ tournamentTeamId });
}
