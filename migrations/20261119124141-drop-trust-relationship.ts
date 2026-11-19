import type { Kysely } from "kysely";

export async function up(db: Kysely<any>): Promise<void> {
	await db.schema.dropTable("TrustRelationship").ifExists().execute();
}
