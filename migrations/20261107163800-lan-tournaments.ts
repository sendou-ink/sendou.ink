import { type Kysely, sql } from "kysely";

export async function up(db: Kysely<any>): Promise<void> {
	await db.transaction().execute(async (trx) => {
		await trx.schema
			.createTable("CalendarEventVenue")
			.addColumn("eventId", "integer", (col) =>
				col.primaryKey().references("CalendarEvent.id").onDelete("cascade"),
			)
			.addColumn("name", "text", (col) => col.notNull())
			.addColumn("address", "text", (col) => col.notNull())
			.addColumn("city", "text")
			.addColumn("countryCode", "text", (col) => col.notNull())
			.addColumn("latitude", "real", (col) => col.notNull())
			.addColumn("longitude", "real", (col) => col.notNull())
			.addColumn("timezone", "text", (col) => col.notNull())
			.modifyEnd(sql`strict`)
			.execute();
	});
}
