import { type Kysely, sql } from "kysely";

export async function up(db: Kysely<any>): Promise<void> {
	await db.transaction().execute(async (trx) => {
		await trx.schema
			.createTable("GroupSuggestion")
			.addColumn("suggesterGroupId", "integer", (col) =>
				col.notNull().references("Group.id").onDelete("cascade"),
			)
			.addColumn("targetGroupId", "integer", (col) =>
				col.notNull().references("Group.id").onDelete("cascade"),
			)
			.addColumn("createdByUserId", "integer", (col) =>
				col.notNull().references("User.id").onDelete("cascade"),
			)
			.addColumn("createdAt", "integer", (col) =>
				col.notNull().defaultTo(sql`(strftime('%s', 'now'))`),
			)
			.addUniqueConstraint(
				"group_suggestion_suggester_group_id_target_group_id",
				["suggesterGroupId", "targetGroupId"],
			)
			// every table in this schema is strict
			.modifyEnd(sql`strict`)
			.execute();

		await trx.schema
			.createIndex("group_suggestion_target_group_id")
			.on("GroupSuggestion")
			.column("targetGroupId")
			.execute();

		await trx.schema
			.alterTable("GroupLike")
			.addColumn("createdByUserId", "integer", (col) =>
				col.references("User.id").onDelete("set null"),
			)
			.execute();
	});
}
