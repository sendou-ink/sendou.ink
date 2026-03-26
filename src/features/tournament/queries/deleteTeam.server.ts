import { sql } from "~/db/sql";

const deleteTeamStm = sql.prepare(/*sql*/ `
  delete from "TournamentTeam"
    where "id" = @tournamentTeamId
`);

const deleteMapPoolStm = sql.prepare(/*sql*/ `
  delete from "MapPoolMap"
    where "tournamentTeamId" = @tournamentTeamId
`);

export const deleteTeam = sql.transaction((tournamentTeamId: number) => {
	deleteMapPoolStm.run({ tournamentTeamId });
	deleteTeamStm.run({ tournamentTeamId });
});
