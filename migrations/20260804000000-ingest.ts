import { type Kysely, sql } from "kysely";

/** Tables for scanner-ingested matches and their links to reported game results */
export async function up(db: Kysely<any>): Promise<void> {
	// kysely does not wrap sqlite migrations in a transaction, so do it here
	await db.transaction().execute(async (trx) => {
		await trx.schema
			.createTable("IngestedMatch")
			.addColumn("id", "integer", (col) => col.primaryKey())
			.addColumn("povUserId", "integer", (col) =>
				col.references("User.id").onDelete("set null"),
			)
			.addColumn("submitterUserId", "integer", (col) =>
				col.references("User.id").onDelete("set null"),
			)
			.addColumn("playedAt", "integer")
			.addColumn("data", "text", (col) => col.notNull())
			.addColumn("matchHash", "text", (col) => col.unique().notNull())
			.addColumn("tournamentIdHint", "integer", (col) =>
				col.references("Tournament.id").onDelete("set null"),
			)
			.addColumn("groupMatchIdHint", "integer", (col) =>
				col.references("GroupMatch.id").onDelete("set null"),
			)
			.addColumn("createdAt", "integer", (col) =>
				col.notNull().defaultTo(sql`(strftime('%s', 'now'))`),
			)
			// every table in this schema is strict
			.modifyEnd(sql`strict`)
			.execute();

		await trx.schema
			.createIndex("ingested_match_pov_user_id_played_at")
			.on("IngestedMatch")
			.columns(["povUserId", "playedAt"])
			.execute();

		await trx.schema
			.createIndex("ingested_match_tournament_id_hint")
			.on("IngestedMatch")
			.column("tournamentIdHint")
			.execute();

		await trx.schema
			.createIndex("ingested_match_group_match_id_hint")
			.on("IngestedMatch")
			.column("groupMatchIdHint")
			.execute();

		await trx.schema
			.createTable("IngestedMatchLink")
			.addColumn("id", "integer", (col) => col.primaryKey())
			.addColumn("ingestedMatchId", "integer", (col) =>
				col
					.notNull()
					.unique()
					.references("IngestedMatch.id")
					.onDelete("cascade"),
			)
			.addColumn("tournamentMatchGameResultId", "integer", (col) =>
				col.references("TournamentMatchGameResult.id").onDelete("cascade"),
			)
			.addColumn("groupMatchMapId", "integer", (col) =>
				col.references("GroupMatchMap.id").onDelete("cascade"),
			)
			.addColumn("createdAt", "integer", (col) =>
				col.notNull().defaultTo(sql`(strftime('%s', 'now'))`),
			)
			.addCheckConstraint(
				"ingested_match_link_one_target",
				sql`("tournamentMatchGameResultId" is not null) + ("groupMatchMapId" is not null) = 1`,
			)
			.modifyEnd(sql`strict`)
			.execute();

		await trx.schema
			.createIndex("ingested_match_link_tournament_match_game_result_id")
			.on("IngestedMatchLink")
			.column("tournamentMatchGameResultId")
			.execute();

		await trx.schema
			.createIndex("ingested_match_link_group_match_map_id")
			.on("IngestedMatchLink")
			.column("groupMatchMapId")
			.execute();

		// ingest context resolution prunes reported games by a createdAt window
		await trx.schema
			.createIndex("tournament_match_game_result_created_at")
			.on("TournamentMatchGameResult")
			.column("createdAt")
			.execute();
	});
}
