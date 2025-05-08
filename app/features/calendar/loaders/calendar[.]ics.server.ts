import type { LoaderFunctionArgs } from "@remix-run/node";
import type { PersistedCalendarEventTag } from "~/db/tables";
import { databaseTimestampToDate } from "~/utils/dates";
import { CALENDAR_PAGE, SENDOU_INK_BASE_URL } from "~/utils/urls";
import * as CalendarRepository from "../CalendarRepository.server";
import {
	loaderFilterSearchParamsSchema,
	loaderTournamentsOnlySearchParamsSchema,
} from "../calendar-schemas";
import { dateAsICalDate, wrapICalLines } from "../calendar-utils";

export const loader = async ({ request }: LoaderFunctionArgs) => {
	const url = new URL(request.url);

	// allows limiting calendar events to specific tags
	const parsedFilterParams = loaderFilterSearchParamsSchema.safeParse({
		tags: url.searchParams.get("tags"),
	});
	const parsedTournamentsOnlyParams =
		loaderTournamentsOnlySearchParamsSchema.safeParse({
			tournaments: url.searchParams.get("tournaments"),
		});

	const tagsToFilterBy = parsedFilterParams.success
		? (parsedFilterParams.data.tags as PersistedCalendarEventTag[])
		: [];
	const onlyTournaments = parsedTournamentsOnlyParams.success
		? Boolean(parsedTournamentsOnlyParams.data.tournaments)
		: false;

	const startTime = new Date();
	const endTime = new Date(startTime);
	// get all events over the next 3 weeks
	endTime.setDate(startTime.getDate() + 21);

	// handle timezone mismatch between server and client
	startTime.setHours(startTime.getHours() - 12);
	endTime.setHours(endTime.getHours() + 12);

	const events = await CalendarRepository.findAllBetweenTwoTimestamps({
		startTime,
		endTime,
		tagsToFilterBy: tagsToFilterBy,
		onlyTournaments: onlyTournaments,
	});

	// iCal doesnt allow calendars with no components
	// https://www.rfc-editor.org/rfc/rfc5545.txt     3.6.
	if (events.length === 0) {
		return new Response(null, { status: 204 });
	}

	const iCalData = eventsAsICal(events);

	return new Response(iCalData, {
		status: 200,
		headers: {
			"Content-Type": "text/calendar",
		},
	});
};

function eventsAsICal(
	events: CalendarRepository.FindAllBetweenTwoTimestampsItem[],
): Buffer {
	const properties =
		"BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//sendou.ink//calendar//EN\r\n";

	const data = `${events.reduce(
		(acc, event) => acc + eventInfoAsICalEvent(event),
		properties,
	)}END:VCALENDAR\r\n`;

	// iCal requires utf-8
	// https://www.rfc-editor.org/rfc/rfc5545.txt     3.1.4
	return Buffer.from(data, "utf8");
}

function eventInfoAsICalEvent(
	event: CalendarRepository.FindAllBetweenTwoTimestampsItem,
): string {
	const date = new Date();
	const eventDate = databaseTimestampToDate(event.startTime);
	const eventEndDate = new Date(databaseTimestampToDate(event.startTime));
	eventEndDate.setHours(eventEndDate.getHours() + 3); // arbitrary length of 3 hours
	const eventLink = `${SENDOU_INK_BASE_URL}${CALENDAR_PAGE}/${event.eventId}`;
	const tags = event.tags.reduce((acc, tag) => `${acc},${tag}`, "").slice(1);

	return wrapICalLines(
		`BEGIN:VEVENT\r\nUID:${crypto.randomUUID()}\r\nDTSTAMP:${dateAsICalDate(
			date,
		)}\r\nDTSTART:${dateAsICalDate(eventDate)}\r\nDTEND:${dateAsICalDate(
			eventEndDate,
		)}\r\nSUMMARY:${
			event.name
		}\r\nLOCATION:${eventLink}\r\nCATEGORIES:${tags}\r\nEND:VEVENT\r\n`,
	);
}
