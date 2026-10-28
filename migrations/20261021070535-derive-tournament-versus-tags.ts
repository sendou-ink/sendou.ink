import { type Kysely, sql } from "kysely";

/** A tournament's 1v1, 2v2 and 3v3 tags are now derived from its `minMembersPerTeam` setting, this clears the stored ones. */
export async function up(db: Kysely<any>): Promise<void> {
	await db.transaction().execute(async (trx) => {
		await sql`
			update "CalendarEvent"
			set "tags" = (
				select case when count(*) = 0 then null else json_group_array("value") end
				from json_each("CalendarEvent"."tags")
				where "value" not in ('ONES', 'DUOS', 'TRIOS')
			)
			where "tournamentId" is not null
				and exists (
					select 1
					from json_each("CalendarEvent"."tags")
					where "value" in ('ONES', 'DUOS', 'TRIOS')
				)
		`.execute(trx);
	});
}
