import type { Kysely } from "kysely";

export async function up(db: Kysely<any>): Promise<void> {
	await db.transaction().execute(async (trx) => {
		await trx.schema
			.alterTable("Lobby")
			.addColumn("weaponRandomizer", "text", (col) =>
				col.notNull().defaultTo("OFF"),
			)
			.execute();
		await trx.schema
			.alterTable("LobbySet")
			.addColumn("rolledWeapons", "text")
			.execute();
	});
}
