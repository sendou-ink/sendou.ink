import type { Kysely } from "kysely";

/**
 * SP changes are derived from the season's Skill rows at read time, making the stored
 * copy redundant. It was also never backfilled for seasons before it was introduced.
 */
export async function up(db: Kysely<any>): Promise<void> {
	await db.schema.alterTable("TournamentResult").dropColumn("spDiff").execute();
}
