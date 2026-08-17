import { type Kysely, sql } from "kysely";

/**
 * Chat rebuild (svelte-big-bang phase 3): messages move from the skalop
 * service into sqlite. A room belongs to exactly one owning entity (only
 * scrims for now; sendouq & tournament columns arrive with their features),
 * membership is resolved from that entity server-side. Lifecycle is driven by
 * `inactiveAt`: null = active, set = inactive since then; archival and
 * permanent deletion are derived from it by the chat feature.
 */
export async function up(db: Kysely<any>): Promise<void> {
	await db.transaction().execute(async (trx) => {
		await trx.schema
			.createTable("ChatRoom")
			.addColumn("id", "integer", (col) => col.primaryKey())
			.addColumn("scrimPostId", "integer", (col) =>
				col.references("ScrimPost.id").onDelete("cascade"),
			)
			.addColumn("inactiveAt", "integer")
			.addColumn("createdAt", "integer", (col) =>
				col.notNull().defaultTo(sql`(strftime('%s', 'now'))`),
			)
			// every table in this schema is strict
			.modifyEnd(sql`strict`)
			.execute();

		await trx.schema
			.createIndex("chat_room_scrim_post_id")
			.unique()
			.on("ChatRoom")
			.column("scrimPostId")
			.execute();

		await trx.schema
			.createTable("ChatRoomMessage")
			.addColumn("id", "integer", (col) => col.primaryKey())
			.addColumn("chatRoomId", "integer", (col) =>
				col.notNull().references("ChatRoom.id").onDelete("cascade"),
			)
			.addColumn("userId", "integer", (col) =>
				col.references("User.id").onDelete("cascade"),
			)
			.addColumn("type", "text")
			.addColumn("contents", "text")
			.addColumn("context", "text")
			.addColumn("createdAt", "integer", (col) =>
				col.notNull().defaultTo(sql`(strftime('%s', 'now'))`),
			)
			.modifyEnd(sql`strict`)
			.execute();

		await trx.schema
			.createIndex("chat_room_message_chat_room_id")
			.on("ChatRoomMessage")
			.column("chatRoomId")
			.execute();

		await trx.schema
			.createTable("ChatRoomRead")
			.addColumn("chatRoomId", "integer", (col) =>
				col.notNull().references("ChatRoom.id").onDelete("cascade"),
			)
			.addColumn("userId", "integer", (col) =>
				col.notNull().references("User.id").onDelete("cascade"),
			)
			.addColumn("lastSeenMessageId", "integer", (col) => col.notNull())
			.addPrimaryKeyConstraint("chat_room_read_pk", ["chatRoomId", "userId"])
			.modifyEnd(sql`strict`)
			.execute();
	});
}
