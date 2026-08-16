import type { ShowcaseCalendarEvent } from "#lib/features/calendar/calendar-types.ts";
import * as ShowcaseTournaments from "#lib/features/front-page/ShowcaseTournaments.server.ts";
import { db } from "#lib/server/db/sql.ts";

async function findCalendarEventIdsByUserId(userId: number): Promise<number[]> {
	const rows = await db
		.selectFrom("SavedCalendarEvent")
		.select("calendarEventId")
		.where("userId", "=", userId)
		.execute();

	return rows.map((r) => r.calendarEventId);
}

/** Upcoming tournaments the user has saved to their calendar. */
export async function findAllUpcomingByUserId(
	userId: number,
): Promise<ShowcaseCalendarEvent[]> {
	const [savedCalendarEventIds, tournaments] = await Promise.all([
		findCalendarEventIdsByUserId(userId),
		ShowcaseTournaments.upcomingTournaments(),
	]);

	const savedTournamentIds = await tournamentIdsByCalendarEventIds(
		savedCalendarEventIds,
	);

	return tournaments.filter((t) => savedTournamentIds.includes(t.id));
}

async function tournamentIdsByCalendarEventIds(
	calendarEventIds: number[],
): Promise<number[]> {
	if (calendarEventIds.length === 0) return [];

	const rows = await db
		.selectFrom("CalendarEvent")
		.select("CalendarEvent.tournamentId")
		.where("CalendarEvent.id", "in", calendarEventIds)
		.where("CalendarEvent.tournamentId", "is not", null)
		.execute();

	return rows.map((r) => r.tournamentId!);
}
