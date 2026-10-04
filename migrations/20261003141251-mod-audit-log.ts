import { type Kysely, sql } from "kysely";

/** Keeps a history of user written public texts for moderators to review */
export async function up(db: Kysely<any>): Promise<void> {
	await db.transaction().execute(async (trx) => {
		await trx.schema
			.createTable("ModAuditLog")
			.addColumn("id", "integer", (col) => col.primaryKey().autoIncrement())
			.addColumn("type", "text", (col) => col.notNull())
			.addColumn("userId", "integer", (col) =>
				col.notNull().references("User.id").onDelete("cascade"),
			)
			.addColumn("text", "text", (col) => col.notNull())
			.addColumn("createdAt", "integer", (col) =>
				col.notNull().defaultTo(sql`(strftime('%s', 'now'))`),
			)
			// every table in this schema is strict
			.modifyEnd(sql`strict`)
			.execute();

		await trx.schema
			.createIndex("mod_audit_log_user_id_type_created_at")
			.on("ModAuditLog")
			.columns(["userId", "type", "createdAt"])
			.execute();
	});
}
