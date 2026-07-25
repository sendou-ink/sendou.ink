import { sql } from "~/db/sql";
import type { Tables } from "~/db/tables";

const stm = sql.prepare(/* sql */ `
  insert into "TournamentMatchGameResult"
    ("matchId", "stageId", "mode", "winnerTeamId", "reporterId", "number", "source", "ko")
  values
    (@matchId, @stageId, @mode, @winnerTeamId, @reporterId, @number, @source, @ko)
  returning *
`);

export function insertTournamentMatchGameResult(
	args: Omit<Tables["TournamentMatchGameResult"], "id" | "createdAt">,
) {
	return stm.get(args) as Tables["TournamentMatchGameResult"];
}
