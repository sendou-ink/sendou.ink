import { sql } from "~/db/sql";
import type { Tables } from "~/db/tables";

const stm = sql.prepare(/* sql */ `
  select 
    "TournamentRound"."id" as "roundId", 
    "TournamentMatch"."bestOf" 
  from "TournamentRound" 
    left join "TournamentMatch" on "TournamentRound"."id" = "TournamentMatch"."roundId"
    left join "TournamentStage" on "TournamentRound"."stageId" = "TournamentStage"."id"
  where "TournamentStage"."tournamentId" = @tournamentId
  group by "TournamentRound"."id"
`);

interface BestOfByTournamentId {
	roundId: Tables["TournamentRound"]["id"];
	bestOf: Tables["TournamentMatch"]["bestOf"];
}

export function bestOfsByTournamentId(tournamentId: number) {
	return stm.all({ tournamentId }) as BestOfByTournamentId[];
}
