import { sql } from "~/db/sql";
import type { ModeShort, StageId } from "~/modules/in-game-lists";
import invariant from "~/utils/invariant";
import { parseDBArray, parseDBJsonArray } from "~/utils/sql";

const stm = sql.prepare(/* sql */ `
  with "q1" as (
    select
      "TournamentMatchGameResult".*,
      json_group_array(
        json_object(
          'tournamentTeamId', "TournamentMatchGameResultParticipant"."tournamentTeamId",
          'userId', "TournamentMatchGameResultParticipant"."userId"
        )
      ) as "participants"
    from "TournamentMatchGameResult"
    left join "TournamentMatchGameResultParticipant" on "TournamentMatchGameResultParticipant"."matchGameResultId" = "TournamentMatchGameResult"."id"
    group by "TournamentMatchGameResult"."id"
  )
  select
    "m"."opponentOne" ->> '$.id' as "opponentOneId",
    "m"."opponentTwo" ->> '$.id' as "opponentTwoId",
    "m"."opponentOne" ->> '$.score' as "opponentOneScore",
    "m"."opponentTwo" ->> '$.score' as "opponentTwoScore",
    "m"."opponentOne" ->> '$.result' as "opponentOneResult",
    "m"."opponentTwo" ->> '$.result' as "opponentTwoResult",
    json_group_array(
      json_object(
        'stageId',
        "q1"."stageId",
        'mode',
        "q1"."mode",
        'winnerTeamId',
        "q1"."winnerTeamId",
        'participants',
        "q1"."participants"
        ) 
      ) as "maps"
  from
    "TournamentMatch" as "m"
  left join "TournamentStage" on "TournamentStage"."id" = "m"."stageId"
  left join "q1" on "q1"."matchId" = "m"."id"
  where "TournamentStage"."tournamentId" = @tournamentId
    and "opponentOneId" is not null 
    and "opponentTwoId" is not null
    and "opponentOneResult" is not null
  group by "m"."id"
  order by "m"."id" asc
`);

interface Opponent {
	id: number;
	score: number;
	result: "win" | "loss";
}
export interface AllMatchResult {
	opponentOne: Opponent;
	opponentTwo: Opponent;
	maps: Array<{
		stageId: StageId;
		mode: ModeShort;
		winnerTeamId: number;
		participants: Array<{
			// in the DB this can actually also be null, but for new tournaments it should always be a number
			tournamentTeamId: number;
			userId: number;
		}>;
	}>;
}

export function allMatchResultsByTournamentId(
	tournamentId: number,
): AllMatchResult[] {
	const rows = stm.all({ tournamentId }) as unknown as any[];

	return rows.map((row) => {
		return {
			opponentOne: {
				id: row.opponentOneId,
				score: row.opponentOneScore,
				result: row.opponentOneResult,
			},
			opponentTwo: {
				id: row.opponentTwoId,
				score: row.opponentTwoScore,
				result: row.opponentTwoResult,
			},
			maps: parseDBJsonArray(row.maps).map((map: any) => {
				const participants = parseDBArray(map.participants);
				invariant(participants.length > 0, "No participants found");
				invariant(
					participants.every(
						(p: any) => typeof p.tournamentTeamId === "number",
					),
					"Some participants have no team id",
				);

				return {
					...map,
					participants,
				};
			}),
		};
	});
}
