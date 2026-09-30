import { type Kysely, sql } from "kysely";

/** Participants of a team event limited to selected members. No rows for an event = the whole team takes part. */
export async function up(db: Kysely<any>): Promise<void> {
	await db.transaction().execute(async (trx) => {
		await trx.schema
			.createTable("TeamEventMember")
			.addColumn("teamEventId", "integer", (col) =>
				col.notNull().references("TeamEvent.id").onDelete("cascade"),
			)
			.addColumn("userId", "integer", (col) =>
				col.notNull().references("User.id").onDelete("cascade"),
			)
			.addPrimaryKeyConstraint("team_event_member_pk", [
				"teamEventId",
				"userId",
			])
			.modifyEnd(sql`strict`)
			.execute();
	});
}
