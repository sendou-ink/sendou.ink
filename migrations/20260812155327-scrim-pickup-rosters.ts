import { type Kysely, sql } from "kysely";

/** Recently used pick-up rosters that can be reused when making a new scrim post */
export async function up(db: Kysely<any>): Promise<void> {
	await db.transaction().execute(async (trx) => {
		await trx.schema
			.createTable("ScrimPickupRoster")
			.addColumn("id", "integer", (col) => col.primaryKey())
			.addColumn("userId", "integer", (col) =>
				col.notNull().references("User.id").onDelete("cascade"),
			)
			.addColumn("usedAt", "integer", (col) =>
				col.notNull().defaultTo(sql`(strftime('%s', 'now'))`),
			)
			// every table in this schema is strict
			.modifyEnd(sql`strict`)
			.execute();

		await trx.schema
			.createIndex("scrim_pickup_roster_user_id_used_at")
			.on("ScrimPickupRoster")
			.columns(["userId", "usedAt"])
			.execute();

		await trx.schema
			.createTable("ScrimPickupRosterUser")
			.addColumn("scrimPickupRosterId", "integer", (col) =>
				col.notNull().references("ScrimPickupRoster.id").onDelete("cascade"),
			)
			.addColumn("userId", "integer", (col) =>
				col.notNull().references("User.id").onDelete("cascade"),
			)
			.addPrimaryKeyConstraint("scrim_pickup_roster_user_pk", [
				"scrimPickupRosterId",
				"userId",
			])
			.modifyEnd(sql`strict`)
			.execute();

		await trx.schema
			.createIndex("scrim_pickup_roster_user_user_id")
			.on("ScrimPickupRosterUser")
			.column("userId")
			.execute();
	});
}
