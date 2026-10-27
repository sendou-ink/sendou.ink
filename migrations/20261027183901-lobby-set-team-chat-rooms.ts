import { type Kysely, sql } from "kysely";

/** Moves the lobby team chat rooms from `Lobby` to `LobbySet`, so every set starts with fresh team chats. */
export async function up(db: Kysely<any>): Promise<void> {
	await db.transaction().execute(async (trx) => {
		await trx.schema
			.alterTable("LobbySet")
			.addColumn("alphaChatRoomId", "integer", (col) =>
				col.references("ChatRoom.id").onDelete("set null"),
			)
			.execute();
		await trx.schema
			.alterTable("LobbySet")
			.addColumn("bravoChatRoomId", "integer", (col) =>
				col.references("ChatRoom.id").onDelete("set null"),
			)
			.execute();

		await sql`
			update "LobbySet"
			set
				"alphaChatRoomId" = (select "alphaChatRoomId" from "Lobby" where "Lobby"."id" = "LobbySet"."lobbyId"),
				"bravoChatRoomId" = (select "bravoChatRoomId" from "Lobby" where "Lobby"."id" = "LobbySet"."lobbyId")
			where "LobbySet"."id" = (
				select max("Latest"."id") from "LobbySet" as "Latest" where "Latest"."lobbyId" = "LobbySet"."lobbyId"
			)
		`.execute(trx);

		for (const column of ["alphaChatRoomId", "bravoChatRoomId"]) {
			await sql
				.raw(`drop trigger "lobby_${snakeCase(column)}_deletes_chat_room"`)
				.execute(trx);
			await trx.schema.dropIndex(`lobby_${snakeCase(column)}`).execute();
			await trx.schema.alterTable("Lobby").dropColumn(column).execute();

			await trx.schema
				.createIndex(`lobby_set_${snakeCase(column)}`)
				.on("LobbySet")
				.column(column)
				.unique()
				.where(sql.ref(column), "is not", null)
				.execute();
			await sql
				.raw(
					`create trigger "lobby_set_${snakeCase(column)}_deletes_chat_room" after delete on "LobbySet"
					when old."${column}" is not null
					begin delete from "ChatRoom" where "id" = old."${column}"; end`,
				)
				.execute(trx);
		}

		// team rooms of lobbies that never got to a set
		await sql`
			delete from "ChatRoom"
			where "type" = 'LOBBY_TEAM'
				and not exists (select 1 from "LobbySet" where "alphaChatRoomId" = "ChatRoom"."id")
				and not exists (select 1 from "LobbySet" where "bravoChatRoomId" = "ChatRoom"."id")
		`.execute(trx);
	});
}

function snakeCase(value: string) {
	return value.replace(/([a-z])([A-Z])/g, "$1_$2").toLowerCase();
}
