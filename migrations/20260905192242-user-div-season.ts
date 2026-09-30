import { type Kysely, sql } from "kysely";

/**
 * LUTI season the user's `div` was earned in, so the profile can say which season it is from.
 * Filled by the div routine from now on; every division stored so far came from season 17.
 */
export async function up(db: Kysely<any>): Promise<void> {
	await db.schema
		.alterTable("User")
		.addColumn("divSeason", "integer")
		.execute();

	await sql`update "User" set "divSeason" = 17 where "div" is not null`.execute(
		db,
	);
}
