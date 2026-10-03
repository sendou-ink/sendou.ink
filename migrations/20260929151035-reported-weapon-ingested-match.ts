import { type Kysely, sql } from "kysely";

/** Tags weapons reported from a scanner read with the ingested match they came from */
export async function up(db: Kysely<any>): Promise<void> {
	await db.transaction().execute(async (trx) => {
		await trx.schema
			.alterTable("ReportedWeapon")
			.addColumn("ingestedMatchId", "integer", (col) =>
				col.references("IngestedMatch.id").onDelete("cascade"),
			)
			.execute();

		await trx.schema
			.createIndex("reported_weapon_ingested_match_id")
			.on("ReportedWeapon")
			.column("ingestedMatchId")
			.where(sql.ref("ingestedMatchId"), "is not", null)
			.execute();
	});
}
