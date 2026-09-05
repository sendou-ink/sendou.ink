import type { Kysely } from "kysely";

/** Lets "which match was being played around this time" lookups range over the window instead of walking every match of the user's tournaments. */
export async function up(db: Kysely<any>): Promise<void> {
	await db.transaction().execute(async (trx) => {
		await trx.schema
			.createIndex("tournament_match_started_at")
			.on("TournamentMatch")
			.column("startedAt")
			.execute();
	});
}
