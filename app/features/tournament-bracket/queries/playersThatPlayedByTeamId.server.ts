import { db, sql } from "~/db/sql";
import type { Tables } from "~/db/tables";

// Legacy type kept for backward compatibility if needed elsewhere
export type PlayerThatPlayedByTeamId = Pick<
	Tables["User"],
	"id" | "username" | "discordAvatar" | "discordId" | "customUrl" | "country"
> & { tournamentTeamId: number };

// Legacy prepared statements kept for compatibility with existing scripts/usages
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

export function playersThatPlayedByTournamentId(tournamentId: number) {
	return stm.all({ tournamentId }) as PlayerThatPlayedByTeamId[];
}

// Removed deprecated stmWithMatches and related API; superseded by
// tournamentParticipantsByTournamentId which returns compact data.

export type TournamentParticipant = {
	userId: number;
	matchIds: number[];
};

export async function tournamentParticipantsByTournamentId(
	tournamentId: number,
): Promise<TournamentParticipant[]> {
	const rows = await db
		.with("playerMatches", (db) =>
			db
				.selectFrom("TournamentMatchGameResultParticipant as Participant")
				.innerJoin(
					"TournamentMatchGameResult as GameResult",
					"GameResult.id",
					"Participant.matchGameResultId",
				)
				.innerJoin("TournamentMatch as Match", "Match.id", "GameResult.matchId")
				.innerJoin("TournamentStage as Stage", "Stage.id", "Match.stageId")
				.select(["Participant.userId", "GameResult.matchId"])
				.where("Stage.tournamentId", "=", tournamentId)
				.distinct(),
		)
		.selectFrom("playerMatches")
		.select(({ fn, ref }) => [
			"playerMatches.userId",
			fn
				.agg<number[]>("json_group_array", [ref("playerMatches.matchId")])
				.as("matchIds"),
		])
		.groupBy("playerMatches.userId")
		.execute();

	return (rows as any[]).map((row) => ({
		userId: row.userId as number,
		matchIds: Array.isArray(row.matchIds)
			? (row.matchIds as number[])
			: (JSON.parse(row.matchIds as string) as number[]),
	}));
}
