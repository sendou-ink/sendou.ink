import { type Kysely, sql } from "kysely";

/**
 * Broadcast overlays: one row per cast account of a tournament holding its producer state, theme and chat room, and
 * one row per user and cast account whose OBS URL shows one of that account's broadcasts.
 */
export async function up(db: Kysely<any>): Promise<void> {
	await db.transaction().execute(async (trx) => {
		await trx.schema
			.createTable("TournamentBroadcast")
			.addColumn("id", "integer", (col) => col.primaryKey().autoIncrement())
			.addColumn("tournamentId", "integer", (col) =>
				col.notNull().references("Tournament.id").onDelete("cascade"),
			)
			.addColumn("platform", "text", (col) => col.notNull())
			.addColumn("account", "text", (col) => col.notNull())
			.addColumn("state", "text", (col) => col.notNull())
			.addColumn("settings", "text", (col) => col.notNull())
			.addColumn("chatRoomId", "integer", (col) =>
				col.references("ChatRoom.id").onDelete("set null"),
			)
			.addColumn("createdAt", "integer", (col) =>
				col.notNull().defaultTo(sql`(strftime('%s', 'now'))`),
			)
			.addUniqueConstraint("tournament_broadcast_tournament_platform_account", [
				"tournamentId",
				"platform",
				"account",
			])
			.modifyEnd(sql`strict`)
			.execute();
		await trx.schema
			.createIndex("tournament_broadcast_chat_room_id")
			.on("TournamentBroadcast")
			.column("chatRoomId")
			.unique()
			.where(sql.ref("chatRoomId"), "is not", null)
			.execute();
		await trx.schema
			.createIndex("tournament_broadcast_platform_account")
			.on("TournamentBroadcast")
			.columns(["platform", "account"])
			.execute();
		await sql
			.raw(
				`create trigger "tournament_broadcast_chat_room_id_deletes_chat_room" after delete on "TournamentBroadcast"
			when old."chatRoomId" is not null
			begin delete from "ChatRoom" where "id" = old."chatRoomId"; end`,
			)
			.execute(trx);

		await trx.schema
			.createTable("UserBroadcastProgram")
			.addColumn("id", "integer", (col) => col.primaryKey().autoIncrement())
			.addColumn("userId", "integer", (col) =>
				col.notNull().references("User.id").onDelete("cascade"),
			)
			.addColumn("platform", "text", (col) => col.notNull())
			.addColumn("account", "text", (col) => col.notNull())
			.addColumn("programKey", "text", (col) => col.notNull().unique())
			.addColumn("broadcastId", "integer", (col) =>
				col.references("TournamentBroadcast.id").onDelete("set null"),
			)
			.addColumn("createdAt", "integer", (col) =>
				col.notNull().defaultTo(sql`(strftime('%s', 'now'))`),
			)
			.addUniqueConstraint("user_broadcast_program_user_platform_account", [
				"userId",
				"platform",
				"account",
			])
			.modifyEnd(sql`strict`)
			.execute();
		await trx.schema
			.createIndex("user_broadcast_program_broadcast_id")
			.on("UserBroadcastProgram")
			.column("broadcastId")
			.execute();
	});
}
