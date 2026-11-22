import { type Kysely, sql } from "kysely";

/**
 * An event is a LAN when it has a venue, so the LAN tag picked by hand is
 * dropped from every event: those with a venue still get it, derived from it.
 */
export async function up(db: Kysely<any>): Promise<void> {
	const events = await sql<{ id: number; tags: string }>`
		select "id", "tags"
		from "CalendarEvent"
		where "tags" like '%"LAN"%'
	`.execute(db);

	for (const event of events.rows) {
		const tags = (JSON.parse(event.tags) as string[]).filter(
			(tag) => tag !== "LAN",
		);

		await sql`
			update "CalendarEvent"
			set "tags" = ${tags.length > 0 ? JSON.stringify(tags) : null}
			where "id" = ${event.id}
		`.execute(db);
	}
}
