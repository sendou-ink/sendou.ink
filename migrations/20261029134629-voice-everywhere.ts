import { type Kysely, sql } from "kysely";

const TEAM_CHAT_ROOM_LIFESPAN_DAYS = 7;
const LEAGUE_TEAM_CHAT_ROOM_LIFESPAN_DAYS = 60;

export async function up(db: Kysely<any>): Promise<void> {
	await db.transaction().execute(async (trx) => {
		for (const column of [
			"isSendouQDisabled",
			"isLobbiesDisabled",
			"isTournamentsDisabled",
			"isLfgDisabled",
		]) {
			await trx.schema
				.alterTable("VoiceSettings")
				.addColumn(column, "integer", (col) => col.notNull().defaultTo(0))
				.execute();
		}

		await trx.schema
			.alterTable("VoiceSession")
			.addColumn("feature", "text", (col) => col.notNull().defaultTo("SENDOUQ"))
			.execute();
		await trx
			.updateTable("VoiceSession")
			.set({ feature: "LOBBIES" })
			.where("roomType", "in", ["LOBBY", "LOBBY_TEAM"])
			.execute();
		await trx
			.updateTable("VoiceSession")
			.set({ feature: "TOURNAMENTS" })
			.where("roomType", "in", ["TOURNAMENT_MATCH", "TOURNAMENT_TEAM"])
			.execute();

		await backfillTournamentTeamChatRooms(trx);
	});
}

async function backfillTournamentTeamChatRooms(trx: Kysely<any>) {
	const { rows } = await sql<{ teamId: number; expiresAt: number }>`
		select
			"TournamentTeam"."id" as "teamId",
			(
				select min("CalendarEventDate"."startsAt")
				from "CalendarEvent"
				inner join "CalendarEventDate" on "CalendarEventDate"."eventId" = "CalendarEvent"."id"
				where "CalendarEvent"."tournamentId" = "Tournament"."id"
			) + 86400 * (
				case when "Tournament"."settings" ->> 'isLeague' = 1
				then ${LEAGUE_TEAM_CHAT_ROOM_LIFESPAN_DAYS}
				else ${TEAM_CHAT_ROOM_LIFESPAN_DAYS} end
			) as "expiresAt"
		from "TournamentTeam"
		inner join "Tournament" on "Tournament"."id" = "TournamentTeam"."tournamentId"
		where "TournamentTeam"."chatRoomId" is null
			and "Tournament"."isFinalized" = 0
			and (
				select count(*) from "TournamentTeamMember"
				where "TournamentTeamMember"."tournamentTeamId" = "TournamentTeam"."id"
			) >= 2
	`.execute(trx);

	for (const { teamId, expiresAt } of rows) {
		if (expiresAt === null || expiresAt <= Math.floor(Date.now() / 1000)) {
			continue;
		}

		const room = await trx
			.insertInto("ChatRoom")
			.values({ type: "TOURNAMENT_TEAM", expiresAt })
			.returning("id")
			.executeTakeFirstOrThrow();

		await trx
			.updateTable("TournamentTeam")
			.set({ chatRoomId: room.id })
			.where("id", "=", teamId)
			.execute();
	}
}
