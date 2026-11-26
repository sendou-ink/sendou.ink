import { type Kysely, sql } from "kysely";

/** Twitch VoDs saved before this are looked up on the next check. */
export async function up(db: Kysely<any>): Promise<void> {
	await db.transaction().execute(async (trx) => {
		await trx.schema
			.alterTable("TournamentMatchVod")
			.addColumn("checkAfter", "integer")
			.execute();

		await sql`update "TournamentMatchVod" set "checkAfter" = 0 where "platform" = 'TWITCH'`.execute(
			trx,
		);
	});
}
