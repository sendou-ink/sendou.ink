import { type Kysely, sql } from "kysely";

export async function up(db: Kysely<any>): Promise<void> {
	await db.schema
		.createTable("UserCalendarFeed")
		.addColumn("id", "integer", (col) => col.primaryKey().autoIncrement())
		.addColumn("userId", "integer", (col) =>
			col.notNull().unique().references("User.id").onDelete("cascade"),
		)
		.addColumn("token", "text", (col) => col.notNull().unique())
		.addColumn("createdAt", "integer", (col) =>
			col.notNull().defaultTo(sql`(strftime('%s', 'now'))`),
		)
		.modifyEnd(sql`strict`)
		.execute();
}
