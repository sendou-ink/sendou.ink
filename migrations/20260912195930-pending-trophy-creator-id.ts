import type { Kysely } from "kysely";

/**
 * A submission names the model's creator. Before, the submitter always became
 * the creator, so a commissioned trophy had to be uploaded by its artist.
 */
export async function up(db: Kysely<any>): Promise<void> {
	await db.transaction().execute(async (trx) => {
		await trx.schema
			.alterTable("PendingTrophy")
			.addColumn("creatorId", "integer", (col) =>
				col.references("User.id").onDelete("set null"),
			)
			.execute();
	});
}
