import type { LoaderFunctionArgs } from "@remix-run/node";
import { parseSearchParams } from "~/utils/remix.server";
import * as CalendarRepository from "../CalendarRepository.server";
import { calendarFiltersSearchParamsObject } from "../calendar-schemas";
import * as CalendarEvent from "../core/CalendarEvent";
import * as ical from "../core/ical";

export const loader = async ({ request }: LoaderFunctionArgs) => {
	const filters = parseSearchParams({
		request,
		schema: calendarFiltersSearchParamsObject,
	}).filters;

	const startTime = new Date();
	const endTime = new Date(startTime);

	// get all events over the two weeks, might be good to make this an parameter in the future
	endTime.setDate(startTime.getDate() + 14);

	// handle timezone mismatch between server and client
	startTime.setHours(startTime.getHours() - 12);
	endTime.setHours(endTime.getHours() + 12);

	const events = await CalendarRepository.findAllBetweenTwoTimestamps({
		startTime,
		endTime,
	});

	const filtered = CalendarEvent.applyFilters(events, filters);

	const iCalData = await ical.getICalendar(
		filtered.flatMap((eventTime) => eventTime.events.shown),
	);

	if (iCalData === null) {
		return new Response(null, { status: 204 });
	}

	return new Response(iCalData, {
		status: 200,
		headers: {
			"Content-Type": "text/calendar",
		},
	});
};
