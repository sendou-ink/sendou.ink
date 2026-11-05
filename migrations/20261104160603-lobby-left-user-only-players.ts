import { type Kysely, sql } from "kysely";

/** Only those who played a set of the lobby keep its chat after leaving. */
export async function up(db: Kysely<any>): Promise<void> {
	await sql`
		delete from "LobbyLeftUser"
		where not exists (
			select 1
			from "LobbySetParticipant"
			inner join "LobbySet" on "LobbySet"."id" = "LobbySetParticipant"."setId"
			where "LobbySet"."lobbyId" = "LobbyLeftUser"."lobbyId"
				and "LobbySetParticipant"."userId" = "LobbyLeftUser"."userId"
				and "LobbySetParticipant"."side" is not null
		)
	`.execute(db);
}
