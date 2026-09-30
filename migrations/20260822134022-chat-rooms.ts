import { type Kysely, sql } from "kysely";

/**
 * Chat rooms, messages and read indicators move from Redis to SQLite. Owner tables get a
 * `chatRoomId` FK replacing their `chatCode` columns.
 */
export async function up(db: Kysely<any>): Promise<void> {
	await db.transaction().execute(async (trx) => {
		await trx.schema
			.createTable("ChatRoom")
			.addColumn("id", "integer", (col) => col.primaryKey())
			.addColumn("type", "text", (col) => col.notNull())
			.addColumn("expiresAt", "integer", (col) => col.notNull())
			.addColumn("inactive", "integer", (col) => col.notNull().defaultTo(0))
			.addColumn("closedAt", "integer")
			.addColumn("createdAt", "integer", (col) =>
				col.notNull().defaultTo(sql`(strftime('%s', 'now'))`),
			)
			// every table in this schema is strict
			.modifyEnd(sql`strict`)
			.execute();

		await trx.schema
			.createIndex("chat_room_expires_at")
			.on("ChatRoom")
			.column("expiresAt")
			.where(sql.ref("closedAt"), "is", null)
			.execute();

		await trx.schema
			.createTable("ChatMessage")
			.addColumn("id", "integer", (col) => col.primaryKey())
			.addColumn("roomId", "integer", (col) =>
				col.notNull().references("ChatRoom.id").onDelete("cascade"),
			)
			.addColumn("authorUserId", "integer", (col) =>
				col.references("User.id").onDelete("set null"),
			)
			.addColumn("type", "text")
			.addColumn("contents", "text")
			.addColumn("publicId", "text", (col) => col.notNull())
			.addColumn("createdAt", "integer", (col) =>
				col.notNull().defaultTo(sql`(strftime('%s', 'now'))`),
			)
			.modifyEnd(sql`strict`)
			.execute();

		await trx.schema
			.createIndex("chat_message_room_id")
			.on("ChatMessage")
			.column("roomId")
			.execute();

		await trx.schema
			.createIndex("chat_message_public_id")
			.on("ChatMessage")
			.column("publicId")
			.unique()
			.execute();

		await trx.schema
			.createTable("ChatMessageReadIndicator")
			.addColumn("userId", "integer", (col) =>
				col.notNull().references("User.id").onDelete("cascade"),
			)
			.addColumn("roomId", "integer", (col) =>
				col.notNull().references("ChatRoom.id").onDelete("cascade"),
			)
			.addColumn("lastSeenMessageId", "integer", (col) => col.notNull())
			.addPrimaryKeyConstraint("chat_message_read_indicator_pk", [
				"userId",
				"roomId",
			])
			.modifyEnd(sql`strict`)
			.execute();

		for (const table of [
			"Group",
			"GroupMatch",
			"TournamentMatch",
			"TournamentTeam",
			"ScrimPost",
		]) {
			await trx.schema
				.alterTable(table)
				.addColumn("chatRoomId", "integer", (col) =>
					col.references("ChatRoom.id").onDelete("set null"),
				)
				.execute();

			await trx.schema.alterTable(table).dropColumn("chatCode").execute();
		}

		await trx.schema
			.createIndex("group_chat_room_id")
			.on("Group")
			.column("chatRoomId")
			.unique()
			.where(sql.ref("chatRoomId"), "is not", null)
			.execute();

		await trx.schema
			.createIndex("group_match_chat_room_id")
			.on("GroupMatch")
			.column("chatRoomId")
			.unique()
			.where(sql.ref("chatRoomId"), "is not", null)
			.execute();

		await trx.schema
			.createIndex("tournament_match_chat_room_id")
			.on("TournamentMatch")
			.column("chatRoomId")
			.unique()
			.where(sql.ref("chatRoomId"), "is not", null)
			.execute();

		await trx.schema
			.createIndex("tournament_team_chat_room_id")
			.on("TournamentTeam")
			.column("chatRoomId")
			.unique()
			.where(sql.ref("chatRoomId"), "is not", null)
			.execute();

		await trx.schema
			.createIndex("scrim_post_chat_room_id")
			.on("ScrimPost")
			.column("chatRoomId")
			.unique()
			.where(sql.ref("chatRoomId"), "is not", null)
			.execute();

		// the room list looks a user's scrims up by their id, which the
		// (scrimPostId, userId) unique constraint can not serve
		await trx.schema
			.createIndex("scrim_post_user_user_id")
			.on("ScrimPostUser")
			.column("userId")
			.execute();

		// the room list only wants the memberships recent enough to still have an
		// open room, which the (userId, groupId) unique constraint can not bound
		await trx.schema
			.createIndex("group_member_user_id_created_at")
			.on("GroupMember")
			.columns(["userId", "createdAt"])
			.execute();
	});
}
