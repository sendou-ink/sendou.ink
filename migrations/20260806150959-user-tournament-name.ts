import type { Kysely } from "kysely";

export async function up(db: Kysely<any>): Promise<void> {
	await db.transaction().execute(async (trx) => {
		await trx.schema
			.alterTable("User")
			.addColumn("tournamentName", "text")
			.execute();
	});
}
