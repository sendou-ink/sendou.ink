import { type Kysely, sql } from "kysely";

/**
 * The weapon pool widget gained its own optional weapon list. Rows saved before
 * that have no settings, so they get an empty list which keeps showing the match
 * profile pool as before.
 */
export async function up(db: Kysely<any>): Promise<void> {
	await sql`
		update "UserWidget"
		set "widget" = json_object(
			'id', 'weapon-pool',
			'settings', json_object('weaponPool', json('[]'))
		)
		where json_extract("widget", '$.id') = 'weapon-pool'
			and json_extract("widget", '$.settings') is null
	`.execute(db);
}
