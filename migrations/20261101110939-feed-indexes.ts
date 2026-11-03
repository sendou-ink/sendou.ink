import { type Kysely, sql } from "kysely";

/**
 * Feed events derived from play history by the feed indexer routine, with its per-source cursors.
 * Also lets the latest scanned match with a replay code be found without parsing every match's `data`
 * and stores the feedback, comments and reactions users leave on feed posts.
 * Calendar events and tournament staff get a creation time so the feed can tell when they were added.
 */
export async function up(db: Kysely<any>): Promise<void> {
	await db.transaction().execute(async (trx) => {
		await trx.schema
			.createIndex("ingested_match_replay_code_created_at")
			.on("IngestedMatch")
			.column("createdAt")
			.where(sql`"data" ->> '$.replayCode'`, "is not", null)
			.execute();

		await trx.schema
			.createTable("FeedEvent")
			.addColumn("id", "integer", (col) => col.primaryKey().autoIncrement())
			.addColumn("userId", "integer", (col) =>
				col.notNull().references("User.id").onDelete("cascade"),
			)
			.addColumn("type", "text", (col) => col.notNull())
			.addColumn("at", "integer", (col) => col.notNull())
			.addColumn("data", "text", (col) => col.notNull())
			.modifyEnd(sql`strict`)
			.execute();

		await trx.schema
			.createIndex("feed_event_user_id_at")
			.on("FeedEvent")
			.columns(["userId", "at"])
			.execute();

		await trx.schema
			.createIndex("feed_event_at")
			.on("FeedEvent")
			.column("at")
			.execute();

		await trx.schema
			.createTable("FeedIndexerCursor")
			.addColumn("source", "text", (col) => col.primaryKey())
			.addColumn("position", "integer", (col) => col.notNull())
			.modifyEnd(sql`strict`)
			.execute();

		await trx.schema
			.createTable("FeedFeedback")
			.addColumn("id", "integer", (col) => col.primaryKey().autoIncrement())
			.addColumn("userId", "integer", (col) =>
				col.notNull().references("User.id").onDelete("cascade"),
			)
			.addColumn("itemType", "text", (col) => col.notNull())
			.addColumn("itemAt", "integer", (col) => col.notNull())
			.addColumn("kind", "text", (col) => col.notNull())
			.addColumn("comment", "text")
			.addColumn("createdAt", "integer", (col) =>
				col.notNull().defaultTo(sql`(strftime('%s', 'now'))`),
			)
			.modifyEnd(sql`strict`)
			.execute();

		await trx.schema
			.createIndex("feed_feedback_user_id_item_type_item_at")
			.on("FeedFeedback")
			.columns(["userId", "itemType", "itemAt"])
			.unique()
			.execute();

		await trx.schema
			.createTable("FeedComment")
			.addColumn("id", "integer", (col) => col.primaryKey().autoIncrement())
			.addColumn("itemId", "text", (col) => col.notNull())
			.addColumn("authorId", "integer", (col) =>
				col.notNull().references("User.id").onDelete("cascade"),
			)
			.addColumn("publicId", "text", (col) => col.notNull().unique())
			.addColumn("contents", "text", (col) => col.notNull())
			.addColumn("createdAt", "integer", (col) =>
				col.notNull().defaultTo(sql`(strftime('%s', 'now'))`),
			)
			.modifyEnd(sql`strict`)
			.execute();

		await trx.schema
			.createIndex("feed_comment_item_id_created_at")
			.on("FeedComment")
			.columns(["itemId", "createdAt"])
			.execute();

		await trx.schema
			.createTable("FeedReaction")
			.addColumn("itemId", "text", (col) => col.notNull())
			.addColumn("userId", "integer", (col) =>
				col.notNull().references("User.id").onDelete("cascade"),
			)
			.addColumn("createdAt", "integer", (col) =>
				col.notNull().defaultTo(sql`(strftime('%s', 'now'))`),
			)
			.addPrimaryKeyConstraint("feed_reaction_pk", ["itemId", "userId"])
			.modifyEnd(sql`strict`)
			.execute();

		await trx.schema
			.alterTable("CalendarEvent")
			.addColumn("createdAt", "integer")
			.execute();

		await trx.schema
			.alterTable("TournamentStaff")
			.addColumn("createdAt", "integer")
			.execute();
	});
}
