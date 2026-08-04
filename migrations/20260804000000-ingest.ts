import { type Kysely, sql } from "kysely";

/** Tables for CV-ingested match events and end-of-game scoreboards */
export async function up(db: Kysely<any>): Promise<void> {
	// kysely does not wrap sqlite migrations in a transaction, so do it here
	await db.transaction().execute(async (trx) => {
		await trx.schema
			.createTable("IngestedEvent")
			.addColumn("id", "integer", (col) => col.primaryKey())
			.addColumn("tournamentId", "integer", (col) =>
				col.references("Tournament.id").onDelete("cascade"),
			)
			.addColumn("povUserId", "integer", (col) =>
				col.references("User.id").onDelete("set null"),
			)
			.addColumn("submitterUserId", "integer", (col) =>
				col.references("User.id").onDelete("set null"),
			)
			.addColumn("type", "text", (col) => col.notNull())
			.addColumn("t", "real", (col) => col.notNull())
			.addColumn("confidence", "real", (col) => col.notNull())
			.addColumn("data", "text", (col) => col.notNull())
			.addColumn("detectedAt", "integer")
			.addColumn("eventHash", "text", (col) => col.unique().notNull())
			.addColumn("createdAt", "integer", (col) =>
				col.notNull().defaultTo(sql`(strftime('%s', 'now'))`),
			)
			// every table in this schema is strict
			.modifyEnd(sql`strict`)
			.execute();

		await trx.schema
			.createIndex("ingested_event_tournament_id")
			.on("IngestedEvent")
			.column("tournamentId")
			.execute();

		await trx.schema
			.createIndex("ingested_event_pov_user_id")
			.on("IngestedEvent")
			.column("povUserId")
			.execute();

		await trx.schema
			.createTable("IngestedScoreboard")
			.addColumn("id", "integer", (col) => col.primaryKey())
			.addColumn("matchGameResultId", "integer", (col) =>
				col
					.notNull()
					.unique()
					.references("TournamentMatchGameResult.id")
					.onDelete("cascade"),
			)
			.addColumn("data", "text", (col) => col.notNull())
			.addColumn("createdAt", "integer", (col) =>
				col.notNull().defaultTo(sql`(strftime('%s', 'now'))`),
			)
			.modifyEnd(sql`strict`)
			.execute();
	});
}
