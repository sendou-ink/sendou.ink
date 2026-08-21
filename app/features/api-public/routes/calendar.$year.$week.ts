import type { LoaderFunctionArgs } from "react-router";
import * as v from "valibot";
import { db } from "~/db/sql";
import {
	databaseTimestampToDate,
	dateToDatabaseTimestamp,
	weekNumberToDateRange,
} from "~/utils/dates";
import { parseParams } from "~/utils/remix.server";
import { coerceNumber } from "~/utils/schema";
import type { GetCalendarWeekResponse } from "../schema";

const paramsSchema = v.object({
	year: v.pipe(coerceNumber(), v.integer(), v.minValue(2020), v.maxValue(2100)),
	week: v.pipe(coerceNumber(), v.integer(), v.minValue(1), v.maxValue(53)),
});

export const loader = async ({ params }: LoaderFunctionArgs) => {
	const { week, year } = parseParams({ params, schema: paramsSchema });

	const events = await fetchEventsOfWeek({
		week,
		year,
	});

	const result: GetCalendarWeekResponse = events.map((event) => ({
		name: event.name,
		startTime: databaseTimestampToDate(event.startsAt).toISOString(),
		tournamentId: event.tournamentId,
		tournamentUrl: event.tournamentId
			? `https://sendou.ink/to/${event.tournamentId}/brackets`
			: null,
	}));

	return Response.json(result);
};

function fetchEventsOfWeek(args: { week: number; year: number }) {
	const { startTime, endTime } = weekNumberToDateRange(args);

	return db
		.selectFrom("CalendarEvent")
		.innerJoin(
			"CalendarEventDate",
			"CalendarEvent.id",
			"CalendarEventDate.eventId",
		)
		.leftJoin("Tournament", "CalendarEvent.tournamentId", "Tournament.id")
		.select([
			"Tournament.id as tournamentId",
			"CalendarEvent.name",
			"CalendarEventDate.startsAt",
		])
		.where(
			"CalendarEventDate.startsAt",
			">=",
			dateToDatabaseTimestamp(startTime),
		)
		.where("CalendarEventDate.startsAt", "<", dateToDatabaseTimestamp(endTime))
		.where("CalendarEvent.hidden", "=", 0)
		.orderBy("CalendarEventDate.startsAt", "asc")
		.execute();
}
