import { sql } from "~/db/sql";

const stm = sql.prepare(/*sql */ `
  select 
    "TournamentTeam"."id",
    "TournamentTeam"."tournamentId"
  from "TournamentTeam"
    where "TournamentTeam"."inviteCode" = @inviteCode
`);

export function findByInviteCode(inviteCode: string) {
	return stm.get({ inviteCode }) as {
		id: number;
		tournamentId: number;
	} | null;
}
