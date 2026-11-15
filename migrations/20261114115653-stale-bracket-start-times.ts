import { type Kysely, sql } from "kysely";

/**
 * Copying a tournament carried its bracket start times over unchanged, so many
 * editions have a follow-up bracket "starting" at or before the tournament
 * itself (usually a previous edition's date). Such a start time is meaningless
 * and closes the bracket's check-in, so it is dropped.
 */
export async function up(db: Kysely<any>): Promise<void> {
	const tournaments = await sql<{
		id: number;
		settings: string;
		startsAt: number;
	}>`
		select "Tournament"."id", "Tournament"."settings", "EventStart"."startsAt"
		from "Tournament"
		inner join (
			select "CalendarEvent"."tournamentId", min("CalendarEventDate"."startsAt") as "startsAt"
			from "CalendarEvent"
			inner join "CalendarEventDate" on "CalendarEventDate"."eventId" = "CalendarEvent"."id"
			where "CalendarEvent"."tournamentId" is not null
			group by "CalendarEvent"."tournamentId"
		) as "EventStart" on "EventStart"."tournamentId" = "Tournament"."id",
			json_each("Tournament"."settings", '$.bracketProgression') as "bracket"
		where json_extract("bracket"."value", '$.startTime') <= "EventStart"."startsAt"
		group by "Tournament"."id"
	`.execute(db);

	for (const tournament of tournaments.rows) {
		const settings = JSON.parse(tournament.settings);

		for (const bracket of settings.bracketProgression) {
			if (
				typeof bracket.startTime === "number" &&
				bracket.startTime <= tournament.startsAt
			) {
				delete bracket.startTime;
			}
		}

		await sql`
			update "Tournament"
			set "settings" = ${JSON.stringify(settings)}
			where "id" = ${tournament.id}
		`.execute(db);
	}
}
