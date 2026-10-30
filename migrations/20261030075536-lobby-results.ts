import { type Kysely, sql } from "kysely";

/**
 * Placements of a lobby's leaderboard, saved when the lobby ends. Tournament placement widgets saved
 * before the widget got its settings get the defaults.
 */
export async function up(db: Kysely<any>): Promise<void> {
	await db.transaction().execute(async (trx) => {
		await trx.schema
			.createTable("LobbyResult")
			.addColumn("lobbyId", "integer", (col) =>
				col.notNull().references("Lobby.id").onDelete("cascade"),
			)
			.addColumn("userId", "integer", (col) =>
				col.notNull().references("User.id").onDelete("cascade"),
			)
			.addColumn("placement", "integer", (col) => col.notNull())
			.addUniqueConstraint("lobby_result_lobby_id_user_id", [
				"lobbyId",
				"userId",
			])
			.modifyEnd(sql`strict`)
			.execute();

		await trx.schema
			.createIndex("lobby_result_user_id")
			.on("LobbyResult")
			.column("userId")
			.execute();

		await sql`
			update "UserWidget"
			set "widget" = json_object(
				'id', 'placement-results',
				'settings', json_object('showTotal', json('false'))
			)
			where json_extract("widget", '$.id') = 'placement-results'
				and json_extract("widget", '$.settings') is null
		`.execute(trx);
	});
}
