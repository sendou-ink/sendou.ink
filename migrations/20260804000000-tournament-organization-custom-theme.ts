import type { Kysely } from "kysely";

/** Lets established tournament organizations set a custom theme for their org pages
 * and per tournament for the tournaments they host */
export async function up(db: Kysely<any>): Promise<void> {
	// kysely does not wrap sqlite migrations in a transaction, so do it here
	await db.transaction().execute(async (trx) => {
		await trx.schema
			.alterTable("TournamentOrganization")
			.addColumn("customTheme", "text")
			.execute();

		await trx.schema
			.alterTable("Tournament")
			.addColumn("customTheme", "text")
			.execute();
	});
}
