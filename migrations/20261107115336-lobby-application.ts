import { type Kysely, sql } from "kysely";

export async function up(db: Kysely<any>): Promise<void> {
	await db.transaction().execute(async (trx) => {
		await trx.schema
			.alterTable("Lobby")
			.addColumn("isApplicationRequired", "integer", (col) =>
				col.notNull().defaultTo(0),
			)
			.execute();

		await trx.schema
			.createTable("LobbyApplication")
			.addColumn("lobbyId", "integer", (col) =>
				col.notNull().references("Lobby.id").onDelete("cascade"),
			)
			.addColumn("userId", "integer", (col) =>
				col.notNull().references("User.id").onDelete("cascade"),
			)
			.addColumn("deniedAt", "integer")
			.addColumn("createdAt", "integer", (col) =>
				col.notNull().defaultTo(sql`(strftime('%s', 'now'))`),
			)
			.addUniqueConstraint("lobby_application_lobby_id_user_id", [
				"lobbyId",
				"userId",
			])
			.modifyEnd(sql`strict`)
			.execute();

		await trx.schema
			.createIndex("lobby_application_user_id")
			.on("LobbyApplication")
			.column("userId")
			.execute();
	});
}
