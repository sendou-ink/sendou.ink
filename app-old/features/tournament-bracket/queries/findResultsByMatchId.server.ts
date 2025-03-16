import { sql } from "~/db/sql";
import type { Tables } from "~/db/tables";
import type { TournamentMatchGameResult } from "~/db/types";
import { parseDBArray } from "~/utils/sql";

const stm = sql.prepare(/* sql */ `
  select
    "TournamentMatchGameResult"."id",
    "TournamentMatchGameResult"."winnerTeamId",
    "TournamentMatchGameResult"."stageId",
    "TournamentMatchGameResult"."mode",
    "TournamentMatchGameResult"."createdAt",
    "TournamentMatchGameResult"."opponentOnePoints",
    "TournamentMatchGameResult"."opponentTwoPoints",
    json_group_array(
      json_object(
        'tournamentTeamId', "TournamentMatchGameResultParticipant"."tournamentTeamId",
        'userId', "TournamentMatchGameResultParticipant"."userId"
      )
    ) as "participants"
  from "TournamentMatchGameResult"
  left join "TournamentMatchGameResultParticipant"
    on "TournamentMatchGameResultParticipant"."matchGameResultId" = "TournamentMatchGameResult"."id"
  where "TournamentMatchGameResult"."matchId" = @matchId
  group by "TournamentMatchGameResult"."id"
  order by "TournamentMatchGameResult"."number" asc
`);

interface FindResultsByMatchIdResult {
	id: TournamentMatchGameResult["id"];
	winnerTeamId: TournamentMatchGameResult["winnerTeamId"];
	stageId: TournamentMatchGameResult["stageId"];
	mode: TournamentMatchGameResult["mode"];
	participants: Array<
		Pick<
			Tables["TournamentMatchGameResultParticipant"],
			"tournamentTeamId" | "userId"
		>
	>;
	createdAt: TournamentMatchGameResult["createdAt"];
	opponentOnePoints: Tables["TournamentMatchGameResult"]["opponentOnePoints"];
	opponentTwoPoints: Tables["TournamentMatchGameResult"]["opponentTwoPoints"];
}

export function findResultsByMatchId(
	matchId: number,
): Array<FindResultsByMatchIdResult> {
	const rows = stm.all({ matchId }) as any[];

	return rows.map((row) => ({
		...row,
		participants: parseDBArray(row.participants),
	}));
}
