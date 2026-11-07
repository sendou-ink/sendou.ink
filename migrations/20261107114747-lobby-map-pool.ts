import type { Kysely } from "kysely";

export async function up(db: Kysely<any>): Promise<void> {
	await db.transaction().execute(async (trx) => {
		await trx.schema.alterTable("Lobby").addColumn("mapPool", "text").execute();
		await trx.schema
			.alterTable("Lobby")
			.addColumn("mapsTournamentId", "integer", (col) =>
				col.references("Tournament.id").onDelete("set null"),
			)
			.execute();
		await trx.schema
			.createIndex("lobby_maps_tournament_id")
			.on("Lobby")
			.column("mapsTournamentId")
			.execute();
	});
}
