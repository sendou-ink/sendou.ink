import { sql } from "~/db/sql";
import type { Tables } from "~/db/tables";

const stm = sql.prepare(/*sql*/ `
  select
    "TournamentTeam"."id",
    "TournamentTeam"."name",
    "TournamentTeamCheckIn"."checkedInAt",
    "TournamentTeam"."inviteCode"
  from
    "TournamentTeam"
    left join "TournamentTeamCheckIn" on
      "TournamentTeamCheckIn"."tournamentTeamId" = "TournamentTeam"."id"
    left join "TournamentTeamMember" on 
      "TournamentTeamMember"."tournamentTeamId" = "TournamentTeam"."id" 
      and "TournamentTeamMember"."isOwner" = 1
  where
    "TournamentTeam"."tournamentId" = @tournamentId
    and "TournamentTeamMember"."userId" = @userId
`);

type FindOwnTeam =
	| (Pick<Tables["TournamentTeam"], "id" | "name" | "inviteCode"> &
			Pick<Tables["TournamentTeamCheckIn"], "checkedInAt">)
	| null;

export function findOwnTournamentTeam({
	tournamentId,
	userId,
}: {
	tournamentId: number;
	userId: number;
}) {
	return stm.get({
		tournamentId,
		userId,
	}) as FindOwnTeam;
}
