import { type Kysely, sql } from "kysely";

/**
 * Feed events derived from play history by the feed indexer routine, with its per-source cursors.
 * Also lets the latest scanned match with a replay code be found without parsing every match's `data`.
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
	});
}
