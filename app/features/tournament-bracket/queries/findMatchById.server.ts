import { sql } from "~/db/sql";
import type { Tables, TournamentRoundMaps } from "~/db/tables";
import type { Match } from "~/modules/brackets-model";
import { parseDBArray } from "~/utils/sql";

const stm = sql.prepare(/* sql */ `
  select
    "TournamentMatch"."id",
    "TournamentMatch"."groupId",
    "TournamentMatch"."opponentOne",
    "TournamentMatch"."opponentTwo",
    "TournamentMatch"."chatCode",
    "TournamentMatch"."startedAt",
    "TournamentMatch"."status",
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
				Tables["TournamentMatch"],
				"id" | "groupId" | "chatCode" | "startedAt" | "status"
		  > &
				Pick<Tables["Tournament"], "mapPickingStyle"> & { players: string }) & {
				opponentOne: string;
				opponentTwo: string;
				roundId: number;
				roundMaps: string;
		  })
		| undefined;

	if (!row) return;

	const roundMaps = JSON.parse(row.roundMaps) as TournamentRoundMaps;

	return {
		...row,
		bestOf: roundMaps.count,
		roundId: row.roundId,
		roundMaps,
		opponentOne: JSON.parse(row.opponentOne) as Match["opponent1"],
		opponentTwo: JSON.parse(row.opponentTwo) as Match["opponent2"],
		status: row.status,
		players: (
			parseDBArray(row.players) as Array<{
				id: Tables["User"]["id"];
				username: Tables["User"]["username"];
				tournamentTeamId: Tables["TournamentTeamMember"]["tournamentTeamId"];
				inGameName: Tables["User"]["inGameName"];
				discordId: Tables["User"]["discordId"];
				customUrl: Tables["User"]["customUrl"];
				discordAvatar: Tables["User"]["discordAvatar"];
				chatNameColor: string | null;
			}>
		).filter((player) => player.id),
	};
};
