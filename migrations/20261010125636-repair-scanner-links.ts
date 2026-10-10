import { type Kysely, sql } from "kysely";

/** Max seconds between a scan's play time and its game's report, mirrors `PLAYED_AT_TOLERANCE_MS` */
const PLAYED_AT_TOLERANCE_SECONDS = 30 * 60;

/**
 * Scanner reads linked to games their sender didn't play: a set's deciding game resolved to the
 * next set its report started, and a later report of the same map anywhere in the tournament took
 * the read in through a names check that passed with no names in common. Those links (and cast
 * footage's, which no longer links) go, then each unlinked read is linked to the game its sender
 * played on the POV seat's side, of the same map, reported nearest and within the tolerance.
 * Weapons reported from a read to a game it no longer links go too; a newly linked read's weapon
 * gets reported when it's re-sent.
 */
export async function up(db: Kysely<any>): Promise<void> {
	await db.transaction().execute(async (trx) => {
		await sql`
			delete from "IngestedMatchLink"
			where not exists (
				select 1
				from "IngestedMatch"
				where "IngestedMatch"."id" = "IngestedMatchLink"."ingestedMatchId"
					and "IngestedMatch"."data" ->> '$.pov' is not null
					and (
						exists (
							select 1
							from "TournamentMatchGameResultParticipant"
							inner join "TournamentMatchGameResult"
								on "TournamentMatchGameResult"."id" = "TournamentMatchGameResultParticipant"."matchGameResultId"
							where "TournamentMatchGameResultParticipant"."matchGameResultId" = "IngestedMatchLink"."tournamentMatchGameResultId"
								and "TournamentMatchGameResultParticipant"."userId" = "IngestedMatch"."povUserId"
								and ("IngestedMatch"."data" ->> '$.pov.team' = "IngestedMatch"."data" ->> '$.winner')
									= ("TournamentMatchGameResultParticipant"."tournamentTeamId" = "TournamentMatchGameResult"."winnerTeamId")
						)
						or exists (
							select 1
							from "GroupMatchMap"
							inner join "GroupMatch" on "GroupMatch"."id" = "GroupMatchMap"."matchId"
							inner join "GroupMember" on "GroupMember"."userId" = "IngestedMatch"."povUserId"
							where "GroupMatchMap"."id" = "IngestedMatchLink"."groupMatchMapId"
								and "GroupMember"."groupId" = case
									when "IngestedMatch"."data" ->> '$.pov.team' = "IngestedMatch"."data" ->> '$.winner'
										then "GroupMatchMap"."winnerGroupId"
									when "GroupMatchMap"."winnerGroupId" = "GroupMatch"."alphaGroupId"
										then "GroupMatch"."bravoGroupId"
									else "GroupMatch"."alphaGroupId"
								end
						)
					)
			)
		`.execute(trx);

		await sql`
			insert into "IngestedMatchLink" ("ingestedMatchId", "tournamentMatchGameResultId")
			with "Candidate" as (
				select
					"IngestedMatch"."id" as "ingestedMatchId",
					"TournamentMatchGameResult"."id" as "gameId",
					abs("TournamentMatchGameResult"."createdAt" - "IngestedMatch"."playedAt") as "distance"
				from "IngestedMatch"
				inner join "TournamentMatchGameResultParticipant"
					on "TournamentMatchGameResultParticipant"."userId" = "IngestedMatch"."povUserId"
				inner join "TournamentMatchGameResult"
					on "TournamentMatchGameResult"."id" = "TournamentMatchGameResultParticipant"."matchGameResultId"
				where "IngestedMatch"."playedAt" is not null
					and "IngestedMatch"."data" ->> '$.pov' is not null
					and "IngestedMatch"."data" ->> '$.winner' is not null
					and coalesce("IngestedMatch"."data" ->> '$.lobby', 'PRIVATE') = 'PRIVATE'
					and json_array_length("IngestedMatch"."data", '$.teams[0].players') = 4
					and json_array_length("IngestedMatch"."data", '$.teams[1].players') = 4
					and "TournamentMatchGameResult"."mode" = "IngestedMatch"."data" ->> '$.mode'
					and "TournamentMatchGameResult"."stageId" = "IngestedMatch"."data" ->> '$.stage'
					and abs("TournamentMatchGameResult"."createdAt" - "IngestedMatch"."playedAt") <= ${PLAYED_AT_TOLERANCE_SECONDS}
					and ("IngestedMatch"."data" ->> '$.pov.team' = "IngestedMatch"."data" ->> '$.winner')
						= ("TournamentMatchGameResultParticipant"."tournamentTeamId" = "TournamentMatchGameResult"."winnerTeamId")
					and not exists (
						select 1 from "IngestedMatchLink"
						where "IngestedMatchLink"."ingestedMatchId" = "IngestedMatch"."id"
					)
					and not exists (
						select 1 from "IngestedMatchLink"
						where "IngestedMatchLink"."tournamentMatchGameResultId" = "TournamentMatchGameResult"."id"
					)
			),
			"Ranked" as (
				select
					*,
					row_number() over (partition by "ingestedMatchId" order by "distance", "gameId") as "matchRank",
					row_number() over (partition by "gameId" order by "distance", "ingestedMatchId") as "gameRank"
				from "Candidate"
			)
			select "ingestedMatchId", "gameId"
			from "Ranked"
			where "matchRank" = 1 and "gameRank" = 1
		`.execute(trx);

		await sql`
			delete from "ReportedWeapon"
			where "ReportedWeapon"."ingestedMatchId" is not null
				and not exists (
					select 1
					from "IngestedMatchLink"
					left join "TournamentMatchGameResult"
						on "TournamentMatchGameResult"."id" = "IngestedMatchLink"."tournamentMatchGameResultId"
					left join "GroupMatchMap"
						on "GroupMatchMap"."id" = "IngestedMatchLink"."groupMatchMapId"
					where "IngestedMatchLink"."ingestedMatchId" = "ReportedWeapon"."ingestedMatchId"
						and (
							(
								"TournamentMatchGameResult"."matchId" = "ReportedWeapon"."tournamentMatchId"
								and "TournamentMatchGameResult"."number" - 1 = "ReportedWeapon"."mapIndex"
							)
							or (
								"GroupMatchMap"."matchId" = "ReportedWeapon"."groupMatchId"
								and "GroupMatchMap"."index" = "ReportedWeapon"."mapIndex"
							)
						)
				)
		`.execute(trx);
	});
}
