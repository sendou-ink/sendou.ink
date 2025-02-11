import { sql } from "~/db/sql";
import type { TournamentRoundMaps } from "~/db/tables";
import type {
	Tournament,
	TournamentMatch,
	TournamentTeamMember,
	User,
} from "~/db/types";
import type { Match } from "~/modules/brackets-model";
import { parseDBArray } from "~/utils/sql";

const stm = sql.prepare(/* sql */ `
  select 
    "TournamentMatch"."id",
    "TournamentMatch"."groupId",
    "TournamentMatch"."opponentOne",
    "TournamentMatch"."opponentTwo",
    "TournamentMatch"."bestOf",
    "TournamentMatch"."chatCode",
    "Tournament"."mapPickingStyle",
    "TournamentRound"."id" as "roundId",
    "TournamentRound"."maps" as "roundMaps",
    json_group_array(
      json_object(
        'id',
        "User"."id",
        'username',
        "User"."username",
        'tournamentTeamId',
        "TournamentTeamMember"."tournamentTeamId",
        'inGameName',
        COALESCE("TournamentTeamMember"."inGameName", "User"."inGameName"),
        'discordId',
        "User"."discordId",
        'customUrl',
        "User"."customUrl",
        'discordAvatar',
        "User"."discordAvatar",
        'chatNameColor', IIF(COALESCE("User"."patronTier", 0) >= 2, "User"."css" ->> 'chat', null)
      )
    ) as "players"
  from "TournamentMatch"
  left join "TournamentStage" on "TournamentStage"."id" = "TournamentMatch"."stageId"
  left join "TournamentRound" on "TournamentRound"."id" = "TournamentMatch"."roundId"
  left join "Tournament" on "Tournament"."id" = "TournamentStage"."tournamentId"
  left join "TournamentTeamMember" on 
    "TournamentTeamMember"."tournamentTeamId" = "TournamentMatch"."opponentOne" ->> '$.id'
    or
    "TournamentTeamMember"."tournamentTeamId" = "TournamentMatch"."opponentTwo" ->> '$.id'
  left join "User" on "User"."id" = "TournamentTeamMember"."userId"
  where "TournamentMatch"."id" = @id
  group by "TournamentMatch"."id"
`);

export type FindMatchById = ReturnType<typeof findMatchById>;

export const findMatchById = (id: number) => {
	const row = stm.get({ id }) as
		| ((Pick<
				TournamentMatch,
				"id" | "groupId" | "opponentOne" | "opponentTwo" | "bestOf" | "chatCode"
		  > &
				Pick<Tournament, "mapPickingStyle"> & { players: string }) & {
				roundId: number;
				roundMaps: string | null;
		  })
		| undefined;

	if (!row) return;

	const roundMaps = row.roundMaps
		? (JSON.parse(row.roundMaps) as TournamentRoundMaps)
		: null;

	return {
		...row,
		bestOf: (roundMaps?.count ?? row.bestOf) as 3 | 5 | 7,
		roundId: row.roundId,
		roundMaps,
		opponentOne: JSON.parse(row.opponentOne) as Match["opponent1"],
		opponentTwo: JSON.parse(row.opponentTwo) as Match["opponent2"],
		players: (
			parseDBArray(row.players) as Array<{
				id: User["id"];
				username: User["username"];
				tournamentTeamId: TournamentTeamMember["tournamentTeamId"];
				inGameName: User["inGameName"];
				discordId: User["discordId"];
				customUrl: User["customUrl"];
				discordAvatar: User["discordAvatar"];
				chatNameColor: string | null;
			}>
		).filter((player) => player.id),
	};
};
