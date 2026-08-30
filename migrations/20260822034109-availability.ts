import { type Kysely, sql } from "kysely";

/** Weekly availability users report for their teammates and friends, and the team events that block it */
export async function up(db: Kysely<any>): Promise<void> {
	await db.transaction().execute(async (trx) => {
		await trx.schema
			.createTable("AvailabilityWeek")
			.addColumn("id", "integer", (col) => col.primaryKey())
			.addColumn("userId", "integer", (col) =>
				col.notNull().references("User.id").onDelete("cascade"),
			)
			.addColumn("weekStartsAt", "integer", (col) => col.notNull())
			.addColumn("timezone", "text", (col) => col.notNull())
			.addColumn("createdAt", "integer", (col) =>
				col.notNull().defaultTo(sql`(strftime('%s', 'now'))`),
			)
			.addColumn("updatedAt", "integer", (col) =>
				col.notNull().defaultTo(sql`(strftime('%s', 'now'))`),
			)
			.addUniqueConstraint("availability_week_user_id_week_starts_at", [
				"userId",
				"weekStartsAt",
			])
			// every table in this schema is strict
			.modifyEnd(sql`strict`)
			.execute();

		await trx.schema
			.createTable("AvailabilitySlot")
			.addColumn("id", "integer", (col) => col.primaryKey())
			.addColumn("availabilityWeekId", "integer", (col) =>
				col.notNull().references("AvailabilityWeek.id").onDelete("cascade"),
			)
			.addColumn("startsAt", "integer", (col) => col.notNull())
			.addColumn("endsAt", "integer", (col) => col.notNull())
			.modifyEnd(sql`strict`)
			.execute();

		await trx.schema
			.createIndex("availability_slot_availability_week_id")
			.on("AvailabilitySlot")
			.column("availabilityWeekId")
			.execute();

		await trx.schema
			.createTable("AvailabilityDayNote")
			.addColumn("availabilityWeekId", "integer", (col) =>
				col.notNull().references("AvailabilityWeek.id").onDelete("cascade"),
			)
			.addColumn("date", "text", (col) => col.notNull())
			.addColumn("text", "text", (col) => col.notNull())
			.addPrimaryKeyConstraint("availability_day_note_pk", [
				"availabilityWeekId",
				"date",
			])
			.modifyEnd(sql`strict`)
			.execute();

		await trx.schema
			.createTable("TeamEvent")
			.addColumn("id", "integer", (col) => col.primaryKey())
			.addColumn("teamId", "integer", (col) =>
				col.notNull().references("AllTeam.id").onDelete("cascade"),
			)
			// the event belongs to the team, so it outlives its author's account,
			// the way every other authored row of the schema does
			.addColumn("authorId", "integer", (col) =>
				col.references("User.id").onDelete("set null"),
			)
			.addColumn("name", "text", (col) => col.notNull())
			.addColumn("startsAt", "integer", (col) => col.notNull())
			.addColumn("endsAt", "integer", (col) => col.notNull())
			.addColumn("createdAt", "integer", (col) =>
				col.notNull().defaultTo(sql`(strftime('%s', 'now'))`),
			)
			.modifyEnd(sql`strict`)
			.execute();

		await trx.schema
			.createIndex("team_event_team_id_starts_at")
			.on("TeamEvent")
			.columns(["teamId", "startsAt"])
			.execute();
	});
}
