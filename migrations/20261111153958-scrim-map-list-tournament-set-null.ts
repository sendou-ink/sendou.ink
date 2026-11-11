import { type Kysely, sql } from "kysely";

/**
 * A scrim side's "maps of a tournament" list blocked deleting that tournament. The list now
 * loses its tournament instead.
 */
export async function up(db: Kysely<any>): Promise<void> {
	// a no-op inside a transaction, and needed off so dropping the old table doesn't cascade
	await sql`pragma foreign_keys = off`.execute(db);

	try {
		await db.transaction().execute(async (trx) => {
			await sql`
				create table "ScrimMapList_new" (
					"id" integer primary key autoincrement,
					"scrimPostId" integer not null,
					"side" text not null check ("side" in ('ALPHA', 'BRAVO')),
					"source" text not null check ("source" in ('TOURNAMENT', 'POOL')),
					"tournamentId" integer,
					"serializedPool" text,
					"updatedAt" integer not null,
					foreign key ("scrimPostId") references "ScrimPost" ("id") on delete cascade,
					foreign key ("tournamentId") references "Tournament" ("id") on delete set null,
					unique ("scrimPostId", "side")
					on conflict rollback
				) strict
			`.execute(trx);

			await sql`
				insert into "ScrimMapList_new" ("id", "scrimPostId", "side", "source", "tournamentId", "serializedPool", "updatedAt")
				select "id", "scrimPostId", "side", "source", "tournamentId", "serializedPool", "updatedAt" from "ScrimMapList"
			`.execute(trx);

			await sql`drop table "ScrimMapList"`.execute(trx);
			await sql`alter table "ScrimMapList_new" rename to "ScrimMapList"`.execute(
				trx,
			);

			await trx.schema
				.createIndex("scrim_map_list_tournament_id")
				.on("ScrimMapList")
				.column("tournamentId")
				.where(sql.ref("tournamentId"), "is not", null)
				.execute();

			const violations = await sql`pragma foreign_key_check`.execute(trx);
			if (violations.rows.length > 0) {
				throw new Error(
					`foreign key check failed: ${JSON.stringify(violations.rows.slice(0, 5))}`,
				);
			}
		});
	} finally {
		await sql`pragma foreign_keys = on`.execute(db);
	}
}
