import { type Kysely, sql } from "kysely";

/**
 * Some weapon pool widgets still carry the settings of the widget's first
 * version ({ weapons: [...] }, dropped in June 2026), which the earlier backfill
 * skipped as they were not null. Reading them crashed the whole user page, so
 * every row without a weaponPool list gets the empty one which keeps showing
 * the match profile pool.
 */
export async function up(db: Kysely<any>): Promise<void> {
	await sql`
		update "UserWidget"
		set "widget" = json_object(
			'id', 'weapon-pool',
			'settings', json_object('weaponPool', json('[]'))
		)
		where json_extract("widget", '$.id') = 'weapon-pool'
			and json_extract("widget", '$.settings.weaponPool') is null
	`.execute(db);
}
