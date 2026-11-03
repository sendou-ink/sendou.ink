import { type Kysely, sql } from "kysely";

export async function up(db: Kysely<any>): Promise<void> {
	await db.transaction().execute(async (trx) => {
		await trx.schema
			.alterTable("Lobby")
			.addColumn("shareKey_new", "text", (col) => col.notNull().defaultTo(""))
			.execute();

		// 10 characters, the length of a `shortNanoid()`
		await sql`
			update "Lobby"
			set "shareKey_new" = coalesce("shareKey", lower(hex(randomblob(5))))
		`.execute(trx);

		await trx.schema.alterTable("Lobby").dropColumn("shareKey").execute();
		await trx.schema
			.alterTable("Lobby")
			.renameColumn("shareKey_new", "shareKey")
			.execute();
	});
}
