import { type Kysely, sql } from "kysely";

export async function up(db: Kysely<any>): Promise<void> {
	await db.transaction().execute(async (trx) => {
		await trx.schema
			.createTable("GroupReadyCheck")
			.addColumn("id", "integer", (col) => col.primaryKey())
			.addColumn("alphaGroupId", "integer", (col) =>
				col.notNull().references("Group.id").onDelete("cascade"),
			)
			.addColumn("bravoGroupId", "integer", (col) =>
				col.notNull().references("Group.id").onDelete("cascade"),
			)
			.addColumn("createdAt", "integer", (col) =>
				col.notNull().defaultTo(sql`(strftime('%s', 'now'))`),
			)
			// every table in this schema is strict
			.modifyEnd(sql`strict`)
			.execute();

		await trx.schema
			.createIndex("group_ready_check_alpha_group_id")
			.on("GroupReadyCheck")
			.column("alphaGroupId")
			.unique()
			.execute();

		await trx.schema
			.createIndex("group_ready_check_bravo_group_id")
			.on("GroupReadyCheck")
			.column("bravoGroupId")
			.unique()
			.execute();

		await trx.schema
			.createTable("GroupReadyCheckConfirmation")
			.addColumn("readyCheckId", "integer", (col) =>
				col.notNull().references("GroupReadyCheck.id").onDelete("cascade"),
			)
			.addColumn("userId", "integer", (col) =>
				col.notNull().references("User.id").onDelete("cascade"),
			)
			.addColumn("createdAt", "integer", (col) =>
				col.notNull().defaultTo(sql`(strftime('%s', 'now'))`),
			)
			.addUniqueConstraint(
				"group_ready_check_confirmation_ready_check_id_user_id",
				["readyCheckId", "userId"],
			)
			.modifyEnd(sql`strict`)
			.execute();

		await trx.schema
			.alterTable("GroupMember")
			.addColumn("missedReadyCheckAt", "integer")
			.execute();
	});
}
