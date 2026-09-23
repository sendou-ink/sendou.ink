import type { Kysely } from "kysely";

/** Either side of a friendship can pin it to the top of their friends list */
export async function up(db: Kysely<any>): Promise<void> {
	await db.transaction().execute(async (trx) => {
		await trx.schema
			.alterTable("Friendship")
			.addColumn("isPinnedByUserOne", "integer", (col) =>
				col.notNull().defaultTo(0),
			)
			.execute();
		await trx.schema
			.alterTable("Friendship")
			.addColumn("isPinnedByUserTwo", "integer", (col) =>
				col.notNull().defaultTo(0),
			)
			.execute();
	});
}
