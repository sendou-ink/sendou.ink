import { type Kysely, sql } from "kysely";

export async function up(db: Kysely<any>): Promise<void> {
	await db.transaction().execute(async (trx) => {
		await sql`
			update "TournamentBroadcast"
			set "settings" = json_remove(
				json_set(
					"settings",
					'$.casters',
					json(
						(
							select json_group_array(
								json_object(
									'userId', "casterId"."value",
									'vdoNinjaUrl', null,
									'isAudioOnly', json('false'),
									'volume', 100
								)
							)
							from json_each("TournamentBroadcast"."settings", '$.casterIds') as "casterId"
						)
					)
				),
				'$.casterIds'
			)
			where json_type("settings", '$.casterIds') = 'array'
		`.execute(trx);
	});
}
