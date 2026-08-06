import { type Kysely, sql } from "kysely";

export async function up(db: Kysely<any>): Promise<void> {
	await db.transaction().execute(async (trx) => {
		await trx.schema
			.alterTable("TournamentTeamMember")
			.addColumn("isOrganizerAdded", "integer", (col) =>
				col.notNull().defaultTo(sql`0`),
			)
			.execute();
	});
}
