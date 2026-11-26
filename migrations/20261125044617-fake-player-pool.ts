import { type Kysely, sql } from "kysely";

const FAKE_PLAYER_COUNT = 1024;

export async function up(db: Kysely<any>): Promise<void> {
	await db.transaction().execute(async (trx) => {
		await trx.schema
			.alterTable("User")
			.addColumn("isFakePlayer", "integer", (col) => col.notNull().defaultTo(0))
			.execute();

		await sql`
			with recursive "seq"("n") as (
				select 1
				union all
				select "n" + 1 from "seq" where "n" < ${FAKE_PLAYER_COUNT}
			)
			insert into "User" ("discordId", "defaultName", "isPlaceholder", "isFakePlayer", "createdAt")
			select null, 'Fake player ' || "n", 1, 1, cast(strftime('%s', 'now') as integer)
			from "seq"
			order by "n"
		`.execute(trx);
	});
}
