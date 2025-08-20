import { sql } from "~/db/sql";
import type { Tables } from "~/db/tables";

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
	Tables["User"],
	"id" | "username" | "discordAvatar" | "discordId" | "customUrl" | "country"
> & { tournamentTeamId: number };

export function playersThatPlayedByTournamentId(tournamentId: number) {
	return stm.all({ tournamentId }) as PlayerThatPlayedByTeamId[];
}

const stmWithMatches = sql.prepare(/* sql */ `
  with player_matches as (
    select 
      p."userId",
      p."tournamentTeamId",
      gr."matchId"
    from "TournamentMatchGameResultParticipant" p
    join "TournamentMatchGameResult" gr on gr."id" = p."matchGameResultId"
    join "TournamentMatch" m on m."id" = gr."matchId"
    join "TournamentStage" s on s."id" = m."stageId"
    where s."tournamentId" = @tournamentId
  )
  select
    u."id",
    u."username",
    u."discordAvatar",
    u."discordId",
    u."customUrl",
    u."country",
    pm."tournamentTeamId",
    json_group_array(distinct pm."matchId") as "matchIds"
  from (select distinct "userId", "tournamentTeamId" from player_matches) players
  join "User" u on u."id" = players."userId"
  join player_matches pm on pm."userId" = players."userId"
  group by u."id"
`);

export type PlayerWithMatches = PlayerThatPlayedByTeamId & {
	matchIds: number[];
};

export function playersThatPlayedWithMatchesByTournamentId(
	tournamentId: number,
) {
	const results = stmWithMatches.all({ tournamentId }) as Array<
		PlayerThatPlayedByTeamId & { matchIds: string }
	>;
	return results.map((player) => ({
		...player,
		matchIds: JSON.parse(player.matchIds) as number[],
	})) as PlayerWithMatches[];
}
