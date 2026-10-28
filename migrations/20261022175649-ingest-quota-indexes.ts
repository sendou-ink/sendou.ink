import type { Kysely } from "kysely";

/** Lets merge candidates and the per-user ingest quota be found from the index alone, without reading the `data` blobs. */
export async function up(db: Kysely<any>): Promise<void> {
	await db.transaction().execute(async (trx) => {
		await trx.schema
			.dropIndex("ingested_match_pov_user_id_played_at")
			.execute();

		await trx.schema
			.createIndex("ingested_match_pov_user_id_played_at_created_at")
			.on("IngestedMatch")
			.columns(["povUserId", "playedAt", "createdAt"])
			.execute();

		await trx.schema
			.createIndex("ingested_match_pov_user_id_created_at")
			.on("IngestedMatch")
			.columns(["povUserId", "createdAt"])
			.execute();
	});
}
