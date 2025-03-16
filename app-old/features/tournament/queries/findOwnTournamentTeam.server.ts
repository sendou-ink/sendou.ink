import { sql } from "~/db/sql";
import type { TournamentTeam, TournamentTeamCheckIn } from "~/db/types";

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
	| (Pick<TournamentTeam, "id" | "name" | "inviteCode"> &
			Pick<TournamentTeamCheckIn, "checkedInAt">)
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
