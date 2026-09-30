import { type Kysely, sql } from "kysely";

/**
 * Team picked map lists overhaul: the per-mode "AUTO_*" map picking styles collapse into "AUTO"
 * with the modes and picks per mode in `Tournament.settings.teamPick`. The organizer set
 * tiebreaker map pool is gone, the neutral map is now a map both teams picked or a random
 * pool map neither picked.
 */
export async function up(db: Kysely<any>): Promise<void> {
	await db.transaction().execute(async (trx) => {
		await sql`
			update "Tournament"
			set "settings" = json_set(
				"settings",
				'$.teamPick',
				json('{"modes":[{"mode":"SZ","count":2},{"mode":"TC","count":2},{"mode":"RM","count":2},{"mode":"CB","count":2}],"pool":"SENDOUQ"}')
			)
			where "mapPickingStyle" = 'AUTO_ALL'
		`.execute(trx);

		for (const mode of ["SZ", "TC", "RM", "CB"]) {
			await sql`
				update "Tournament"
				set "settings" = json_set(
					"settings",
					'$.teamPick',
					json(${`{"modes":[{"mode":"${mode}","count":6}],"pool":"SENDOUQ"}`})
				)
				where "mapPickingStyle" = ${`AUTO_${mode}`}
			`.execute(trx);
		}

		await sql`
			update "Tournament"
			set "mapPickingStyle" = 'AUTO'
			where "mapPickingStyle" like 'AUTO_%'
		`.execute(trx);

		await sql`
			delete from "MapPoolMap"
			where "tieBreakerCalendarEventId" is not null
		`.execute(trx);
		await trx.schema
			.dropIndex("map_pool_map_tie_breaker_calendar_event_id")
			.execute();
		await trx.schema
			.alterTable("MapPoolMap")
			.dropColumn("tieBreakerCalendarEventId")
			.execute();

		await sql`
			update "TournamentMatchGameResult"
			set "source" = 'RANDOM'
			where "source" = 'TIEBREAKER'
		`.execute(trx);
	});
}
