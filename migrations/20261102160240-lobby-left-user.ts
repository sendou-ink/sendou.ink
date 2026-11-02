import { type Kysely, sql } from "kysely";

export async function up(db: Kysely<any>): Promise<void> {
	await db.transaction().execute(async (trx) => {
		await trx.schema
			.createTable("LobbyLeftUser")
			.addColumn("lobbyId", "integer", (col) =>
				col.notNull().references("Lobby.id").onDelete("cascade"),
			)
			.addColumn("userId", "integer", (col) =>
				col.notNull().references("User.id").onDelete("cascade"),
			)
			.addColumn("createdAt", "integer", (col) =>
				col.notNull().defaultTo(sql`(strftime('%s', 'now'))`),
			)
			.addUniqueConstraint("lobby_left_user_lobby_id_user_id", [
				"lobbyId",
				"userId",
			])
			.modifyEnd(sql`strict`)
			.execute();

		await trx.schema
			.createIndex("lobby_left_user_user_id")
			.on("LobbyLeftUser")
			.column("userId")
			.execute();
	});
}
