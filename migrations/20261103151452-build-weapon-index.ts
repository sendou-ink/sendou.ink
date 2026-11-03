import { type Kysely, sql } from "kysely";

/** Existing builds keep showing their weapons in the in-game order they were shown in before. */
export async function up(db: Kysely<any>): Promise<void> {
	await db.transaction().execute(async (trx) => {
		await trx.schema
			.alterTable("BuildWeapon")
			.addColumn("index", "integer", (col) => col.notNull().defaultTo(0))
			.execute();
		await sql`update "BuildWeapon" set "index" = (select count(*) from "BuildWeapon" as "other" where "other"."buildId" = "BuildWeapon"."buildId" and "other"."weaponSplId" < "BuildWeapon"."weaponSplId")`.execute(
			trx,
		);
	});
}
