import { type Kysely, sql } from "kysely";

/** Lets players report why a SendouQ match was cancelled and who caused it */
export async function up(db: Kysely<any>): Promise<void> {
	// kysely does not wrap sqlite migrations in a transaction, so do it here
	await db.transaction().execute(async (trx) => {
		await trx.schema
			.createTable("GroupMatchCancelReport")
			.addColumn("id", "integer", (col) => col.primaryKey().autoIncrement())
			.addColumn("groupMatchId", "integer", (col) =>
				col.notNull().references("GroupMatch.id").onDelete("cascade"),
			)
			.addColumn("groupId", "integer", (col) =>
				col.notNull().references("Group.id").onDelete("cascade"),
			)
			.addColumn("authorUserId", "integer", (col) =>
				col.notNull().references("User.id").onDelete("cascade"),
			)
			.addColumn("reason", "text", (col) => col.notNull())
			.addColumn("createdAt", "integer", (col) =>
				col.notNull().defaultTo(sql`(strftime('%s', 'now'))`),
			)
			.addUniqueConstraint(
				"group_match_cancel_report_group_match_id_group_id",
				["groupMatchId", "groupId"],
			)
			// every table in this schema is strict
			.modifyEnd(sql`strict`)
			.execute();

		await trx.schema
			.createTable("GroupMatchCancelReportPlayer")
			.addColumn("cancelReportId", "integer", (col) =>
				col
					.notNull()
					.references("GroupMatchCancelReport.id")
					.onDelete("cascade"),
			)
			.addColumn("userId", "integer", (col) =>
				col.notNull().references("User.id").onDelete("cascade"),
			)
			.addUniqueConstraint(
				"group_match_cancel_report_player_cancel_report_id_user_id",
				["cancelReportId", "userId"],
			)
			.modifyEnd(sql`strict`)
			.execute();

		await trx.schema
			.createIndex("group_match_cancel_report_player_user_id_idx")
			.on("GroupMatchCancelReportPlayer")
			.column("userId")
			.execute();
	});
}
