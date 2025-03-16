import { sql } from "~/db/sql";
import type { User } from "~/db/types";

const stm = sql.prepare(/* sql */ `
  select
    "User"."id",
    "User"."username",
    "User"."discordAvatar",
    "User"."discordId",
    "User"."customUrl",
    "User"."country",
    "TournamentTeam"."id" as "tournamentTeamId"
  from "TournamentTeam"
    left join "TournamentTeamMember" on "TournamentTeamMember"."tournamentTeamId" = "TournamentTeam"."id"
    left join "User" on "User"."id" = "TournamentTeamMember"."userId"
    left join "TournamentStage" on "TournamentStage"."tournamentId" = "TournamentTeam"."tournamentId"
    left join "TournamentMatch" on "TournamentMatch"."stageId" = "TournamentStage"."id"
    left join "TournamentMatchGameResult" on "TournamentMatchGameResult"."matchId" = "TournamentMatch"."id"
    right join "TournamentMatchGameResultParticipant" on 
      "TournamentMatchGameResultParticipant"."matchGameResultId" = "TournamentMatchGameResult"."id"
      and
      "TournamentTeamMember"."userId" = "TournamentMatchGameResultParticipant"."userId"

  where "TournamentTeam"."tournamentId" = @tournamentId
  group by "User"."id"
`);

export type PlayerThatPlayedByTeamId = Pick<
	User,
	"id" | "username" | "discordAvatar" | "discordId" | "customUrl" | "country"
> & { tournamentTeamId: number };

export function playersThatPlayedByTournamentId(tournamentId: number) {
	return stm.all({ tournamentId }) as PlayerThatPlayedByTeamId[];
}
