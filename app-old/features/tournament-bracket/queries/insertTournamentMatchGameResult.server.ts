import { sql } from "~/db/sql";
import type { Tables } from "~/db/tables";
import type { TournamentMatchGameResult } from "~/db/types";

const stm = sql.prepare(/* sql */ `
  insert into "TournamentMatchGameResult"
    ("matchId", "stageId", "mode", "winnerTeamId", "reporterId", "number", "source", "opponentOnePoints", "opponentTwoPoints")
  values
    (@matchId, @stageId, @mode, @winnerTeamId, @reporterId, @number, @source, @opponentOnePoints, @opponentTwoPoints)
  returning *
`);

export function insertTournamentMatchGameResult(
	args: Omit<Tables["TournamentMatchGameResult"], "id" | "createdAt">,
) {
	return stm.get(args) as TournamentMatchGameResult;
}
