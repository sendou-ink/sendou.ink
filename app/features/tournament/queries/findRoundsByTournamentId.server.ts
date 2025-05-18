import { sql } from "~/db/sql";
import type { Tables } from "~/db/tables";

const stm = sql.prepare(/* sql */ `
  select
    "TournamentStage"."id" as "stageId",
    "TournamentStage"."name" as "stageName",
    "TournamentStage"."type" as "stageType",
    "TournamentRound"."number" as "roundNumber",
    "TournamentGroup"."number" as "groupNumber"
  from "TournamentStage"
  left join "TournamentGroup" on "TournamentGroup"."stageId" = "TournamentStage"."id"
  left join "TournamentRound" on "TournamentRound"."groupId" = "TournamentGroup"."id"
  where "TournamentStage"."tournamentId" = @tournamentId
  group by "TournamentStage"."id", "TournamentRound"."number", "TournamentGroup"."number"
`);

export function findRoundsByTournamentId(tournamentId: number) {
	return stm.all({ tournamentId }) as Array<{
		stageId: number;
		stageName: string;
		stageType: Tables["TournamentStage"]["type"];
		roundNumber: number;
		groupNumber: number;
	}>;
}
