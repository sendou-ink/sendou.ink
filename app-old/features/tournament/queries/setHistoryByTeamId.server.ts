import { sql } from "~/db/sql";
import type { TournamentMatchGameResult, User } from "~/db/types";
import type { ModeShort, StageId } from "~/modules/in-game-lists";
import { removeDuplicatesByProperty } from "~/utils/arrays";
import { parseDBArray } from "~/utils/sql";

const stm = sql.prepare(/* sql */ `
  with "q1" as (
    select 
      "m"."id" as "tournamentMatchId",
      "m"."opponentOne" ->> '$.score' as "opponentOneScore",
      "m"."opponentTwo" ->> '$.score' as "opponentTwoScore",
      "otherTeam"."name" as "otherTeamName",
      "otherTeam"."id" as "otherTeamId",
      "round"."number" as "roundNumber",
      "round"."stageId" as "stageId",
      "group"."number" as "groupNumber",
      json_group_array(
        json_object(
          'mode',
          "r"."mode",
          'stageId',
          "r"."stageId",
          'wasWinner',
          "r"."winnerTeamId" == @tournamentTeamId,
          'source',
          "r"."source"
        )
      ) as "matches"
    from "TournamentMatch" as "m"
    left join "TournamentMatchGameResult" as "r" on "m"."id" = "r"."matchId"
    left join "TournamentRound" as "round" on "m"."roundId" = "round"."id"
    left join "TournamentGroup" as "group" on "m"."groupId" = "group"."id"
    left join "TournamentTeam" as "otherTeam" on 
      (
      "m"."opponentOne" ->> '$.id' != @tournamentTeamId 
        and 
      "m"."opponentOne" ->> '$.id' = "otherTeam"."id"
      ) or
      (
        "m"."opponentTwo" ->> '$.id' != @tournamentTeamId 
          and 
        "m"."opponentTwo" ->> '$.id' = "otherTeam"."id"
      )
    where 
    (
        "m"."opponentOne" ->> '$.id' = @tournamentTeamId
      or
        "m"."opponentTwo" ->> '$.id' = @tournamentTeamId
    )
    and "m"."status" >= 4
    group by "m"."id"
    order by "groupNumber" asc, "roundNumber" asc, "r"."number" asc
  )
  select 
    "q1".*,
    json_group_array(
      json_object(
        'id',
        "u"."id",
        'username',
        "u"."username",
        'discordAvatar',
        "u"."discordAvatar",
        'discordId',
        "u"."discordId",
        'customUrl',
        "u"."customUrl"
      )
    ) as "players"
  from "q1"
  left join "TournamentMatchGameResult" as "r" on "q1"."tournamentMatchId" = "r"."matchId"
  left join "TournamentMatchGameResultParticipant" as "p" on "r"."id" = "p"."matchGameResultId"
  left join "User" as "u" on "p"."userId" = "u"."id"
  -- filters out own team results
  inner join "TournamentTeamMember" as "m" on "p"."userId" = "m"."userId" 
    and "m"."tournamentTeamId" == "q1"."otherTeamId"
  group by "q1"."tournamentMatchId"
`);

export interface SetHistoryByTeamIdItem {
	tournamentMatchId: number;
	opponentOneScore: number | null;
	opponentTwoScore: number | null;
	otherTeamName: string;
	otherTeamId: number;
	roundNumber: number;
	stageId: number;
	groupNumber: number;
	matches: {
		stageId: StageId;
		source: TournamentMatchGameResult["source"];
		mode: ModeShort;
		wasWinner: number;
	}[];
	players: Array<
		Pick<User, "id" | "username" | "discordAvatar" | "discordId" | "customUrl">
	>;
}

export function setHistoryByTeamId(
	tournamentTeamId: number,
): Array<SetHistoryByTeamIdItem> {
	const rows = stm.all({ tournamentTeamId }) as any[];

	return rows.map((row) => {
		return {
			...row,
			matches: parseDBArray(row.matches),
			// TODO: there is probably a way to do this in SQL
			players: removeDuplicatesByProperty(
				parseDBArray(row.players),
				(u: Pick<User, "id">) => u.id,
			),
		};
	});
}
