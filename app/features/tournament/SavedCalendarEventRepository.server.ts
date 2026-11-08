import { db } from "~/db/sql";
import { actorId } from "~/features/auth/core/user.server";
import type { ShowcaseCalendarEvent } from "~/features/calendar/calendar-types";
import * as ShowcaseTournaments from "~/features/front-page/core/ShowcaseTournaments.server";
import { databaseTimestampNow } from "~/utils/dates";

export function saveOwn(tournamentId: number) {
	return db
		.insertInto("SavedCalendarEvent")
		.values((eb) => ({
			userId: actorId(),
			calendarEventId: eb
				.selectFrom("CalendarEvent")
				.select("CalendarEvent.id")
				.where("CalendarEvent.tournamentId", "=", tournamentId),
		}))
		.onConflict((oc) => oc.columns(["userId", "calendarEventId"]).doNothing())
		.execute();
}

export function unsaveByUserId({
	userId,
	tournamentId,
}: {
	userId: number;
	tournamentId: number;
}) {
	return db
		.deleteFrom("SavedCalendarEvent")
		.where("userId", "=", userId)
		.where("calendarEventId", "=", (eb) =>
			eb
				.selectFrom("CalendarEvent")
				.select("CalendarEvent.id")
				.where("CalendarEvent.tournamentId", "=", tournamentId),
		)
		.execute();
}

export async function isSaved({
	userId,
	tournamentId,
}: {
	userId: number;
	tournamentId: number;
}): Promise<boolean> {
	const row = await db
		.selectFrom("SavedCalendarEvent")
		.select("id")
		.where("userId", "=", userId)
		.where("calendarEventId", "=", (eb) =>
			eb
				.selectFrom("CalendarEvent")
				.select("CalendarEvent.id")
				.where("CalendarEvent.tournamentId", "=", tournamentId),
		)
		.executeTakeFirst();

	return Boolean(row);
}

/** Counts the saved tournaments of the user that haven't started yet. */
export async function countUpcomingByUserId(userId: number): Promise<number> {
	const result = await db
		.selectFrom("SavedCalendarEvent")
		.select((eb) => eb.fn.countAll<number>().as("count"))
		.where("SavedCalendarEvent.userId", "=", userId)
		.where("SavedCalendarEvent.calendarEventId", "in", (eb) =>
			eb
				.selectFrom("CalendarEventDate")
				.select("CalendarEventDate.eventId")
				.where("CalendarEventDate.startsAt", ">", databaseTimestampNow()),
		)
		.executeTakeFirstOrThrow();

	return result.count;
}

async function findCalendarEventIdsByUserId(userId: number): Promise<number[]> {
	const rows = await db
		.selectFrom("SavedCalendarEvent")
		.select("calendarEventId")
		.where("userId", "=", userId)
		.execute();

	return rows.map((r) => r.calendarEventId);
}

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

export function deleteByTournamentId(tournamentId: number) {
	return db
		.deleteFrom("SavedCalendarEvent")
		.where("calendarEventId", "=", (eb) =>
			eb
				.selectFrom("CalendarEvent")
				.select("CalendarEvent.id")
				.where("CalendarEvent.tournamentId", "=", tournamentId),
		)
		.execute();
}
