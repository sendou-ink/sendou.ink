import { type Kysely, sql } from "kysely";

export async function up(db: Kysely<any>): Promise<void> {
	await db.transaction().execute(async (trx) => {
		await trx.schema
			.createTable("UserBroadcastSetup")
			.addColumn("id", "integer", (col) => col.primaryKey().autoIncrement())
			.addColumn("userId", "integer", (col) =>
				col.notNull().unique().references("User.id").onDelete("cascade"),
			)
			.addColumn("programKey", "text", (col) => col.notNull().unique())
			.addColumn("broadcastId", "integer", (col) =>
				col.references("TournamentBroadcast.id").onDelete("set null"),
			)
			.addColumn("obsAudio", "text")
			.addColumn("createdAt", "integer", (col) =>
				col.notNull().defaultTo(sql`(strftime('%s', 'now'))`),
			)
			.modifyEnd(sql`strict`)
			.execute();
		await trx.schema
			.createIndex("user_broadcast_setup_broadcast_id")
			.on("UserBroadcastSetup")
			.column("broadcastId")
			.execute();

		// one URL per user from now on: the one showing the newest broadcast keeps working
		await sql`
			insert into "UserBroadcastSetup" ("id", "userId", "programKey", "broadcastId", "createdAt")
			select "id", "userId", "programKey", "broadcastId", "createdAt"
			from (
				select *, row_number() over (
					partition by "userId"
					order by "broadcastId" is null, "broadcastId" desc, "id" desc
				) as "rank"
				from "UserBroadcastProgram"
			)
			where "rank" = 1
		`.execute(trx);

		await trx.schema.dropTable("UserBroadcastProgram").execute();
	});
}
