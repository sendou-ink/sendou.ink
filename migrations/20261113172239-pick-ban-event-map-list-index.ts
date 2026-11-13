import type { Kysely } from "kysely";

/**
 * A BAN_2 ban remembers which entry of the match's map list it banned, so a map listed twice
 * can have just one of its copies banned.
 */
export async function up(db: Kysely<any>): Promise<void> {
	await db.transaction().execute(async (trx) => {
		await trx.schema
			.alterTable("TournamentMatchPickBanEvent")
			.addColumn("mapListIndex", "integer")
			.execute();
	});
}
