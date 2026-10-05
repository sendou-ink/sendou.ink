import type { Kysely } from "kysely";

/** Who quick added the member to the group, so they can leave along with them */
export async function up(db: Kysely<any>): Promise<void> {
	await db.transaction().execute(async (trx) => {
		await trx.schema
			.alterTable("GroupMember")
			.addColumn("addedByUserId", "integer", (col) =>
				col.references("User.id").onDelete("set null"),
			)
			.execute();
	});
}
