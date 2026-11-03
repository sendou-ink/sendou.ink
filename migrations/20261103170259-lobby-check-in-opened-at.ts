import type { Kysely } from "kysely";

/** Check-in now opens once enough have signed up, the opening moment no longer being derivable from the start time. */
export async function up(db: Kysely<any>): Promise<void> {
	await db.schema
		.alterTable("Lobby")
		.renameColumn("checkInNotifiedAt", "checkInOpenedAt")
		.execute();
}
