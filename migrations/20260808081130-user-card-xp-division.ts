import { type Kysely, sql } from "kysely";

export async function up(db: Kysely<any>): Promise<void> {
	await db.transaction().execute(async (trx) => {
		await trx.schema
			.alterTable("User")
			.addColumn("xpDivision", "text")
			.execute();

		// a self-reported peak XP was the only way to pick a division before, so it carries over
		await sql`
			update "User"
			set "xpDivision" = iif("unverifiedPeakXP" ->> '$.takoroka' is not null, 'JPN', 'WEST')
			where "unverifiedPeakXP" is not null
		`.execute(trx);
	});
}
