import { sql } from "~/db/sql";
import type { TournamentRoundMaps } from "~/db/tables";
import type { ModeShort, StageId } from "~/modules/in-game-lists/types";
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
  ),
  "TeamMembers1" as (
    select
      "tournamentTeamId",
      json_group_array("userId") as "memberUserIds"
    from "TournamentTeamMember"
    group by "tournamentTeamId"
  ),
  "TeamMembers2" as (
    select
      "tournamentTeamId",
      json_group_array("userId") as "memberUserIds"
    from "TournamentTeamMember"
    group by "tournamentTeamId"
  )
  select
    "m"."opponentOne" ->> '$.id' as "opponentOneId",
    "m"."opponentTwo" ->> '$.id' as "opponentTwoId",
    "m"."opponentOne" ->> '$.score' as "opponentOneScore",
    "m"."opponentTwo" ->> '$.score' as "opponentTwoScore",
    "m"."opponentOne" ->> '$.result' as "opponentOneResult",
    "m"."opponentTwo" ->> '$.result' as "opponentTwoResult",
    "TournamentRound"."maps" as "roundMaps",
    "Team1"."droppedOut" as "opponentOneDroppedOut",
    "Team2"."droppedOut" as "opponentTwoDroppedOut",
    "Team1"."activeRosterUserIds" as "opponentOneActiveRoster",
    "Team2"."activeRosterUserIds" as "opponentTwoActiveRoster",
    "TeamMembers1"."memberUserIds" as "opponentOneMemberUserIds",
    "TeamMembers2"."memberUserIds" as "opponentTwoMemberUserIds",
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
  inner join "TournamentRound" on "TournamentRound"."id" = "m"."roundId"
  left join "TournamentStage" on "TournamentStage"."id" = "m"."stageId"
  left join "q1" on "q1"."matchId" = "m"."id"
  left join "TournamentTeam" as "Team1" on "Team1"."id" = "m"."opponentOne" ->> '$.id'
  left join "TournamentTeam" as "Team2" on "Team2"."id" = "m"."opponentTwo" ->> '$.id'
  left join "TeamMembers1" on "TeamMembers1"."tournamentTeamId" = "Team1"."id"
  left join "TeamMembers2" on "TeamMembers2"."tournamentTeamId" = "Team2"."id"
  where "TournamentStage"."tournamentId" = @tournamentId
    and "opponentOneId" is not null
    and "opponentTwoId" is not null
    and "opponentOneResult" is not null
  group by "m"."id"
  order by "m"."id" asc
`); // strictly speaking the order by condition is not accurate, future improvement would be to add order conditions that match the tournament structure

interface Opponent {
	id: number;
	score: number;
	result: "win" | "loss";
	droppedOut: boolean;
	activeRosterUserIds: number[] | null;
	memberUserIds: number[];
}
export interface AllMatchResult {
	opponentOne: Opponent;
	opponentTwo: Opponent;
	roundMaps: TournamentRoundMaps;
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
		const roundMaps = JSON.parse(row.roundMaps) as TournamentRoundMaps;

		const parseActiveRoster = (roster: string | null): number[] | null => {
			if (!roster) return null;
			try {
				const parsed = JSON.parse(roster);
				return Array.isArray(parsed) ? parsed : null;
			} catch {
				return null;
			}
		};

		const parseMemberUserIds = (members: string | null): number[] => {
			if (!members) return [];
			try {
				const parsed = JSON.parse(members);
				return Array.isArray(parsed) ? parsed : [];
			} catch {
				return [];
			}
		};

		const opponentOne: Opponent = {
			id: row.opponentOneId,
			score: row.opponentOneScore,
			result: row.opponentOneResult,
			droppedOut: row.opponentOneDroppedOut === 1,
			activeRosterUserIds: parseActiveRoster(row.opponentOneActiveRoster),
			memberUserIds: parseMemberUserIds(row.opponentOneMemberUserIds),
		};
		const opponentTwo: Opponent = {
			id: row.opponentTwoId,
			score: row.opponentTwoScore,
			result: row.opponentTwoResult,
			droppedOut: row.opponentTwoDroppedOut === 1,
			activeRosterUserIds: parseActiveRoster(row.opponentTwoActiveRoster),
			memberUserIds: parseMemberUserIds(row.opponentTwoMemberUserIds),
		};

		const rawMaps = parseDBJsonArray(row.maps);
		const hasGameResults = rawMaps.length > 0 && rawMaps[0].stageId !== null;

		return {
			opponentOne,
			opponentTwo,
			roundMaps,
			maps: hasGameResults
				? rawMaps.map((map: any) => {
						const participants = parseDBArray(map.participants);
						invariant(participants.length > 0, "No participants found");
						invariant(
							participants.every(
								(p: any) => typeof p.tournamentTeamId === "number",
							),
							"Some participants have no team id",
						);
						invariant(
							participants.every(
								(p: any) =>
									p.tournamentTeamId === row.opponentOneId ||
									p.tournamentTeamId === row.opponentTwoId,
							),
							"Some participants have an invalid team id",
						);

						return {
							...map,
							participants,
						};
					})
				: [],
		};
	});
}
