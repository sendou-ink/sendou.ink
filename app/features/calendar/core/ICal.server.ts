import * as ics from "ics";
import type { CalendarEvent } from "~/features/calendar/calendar-types";
import { logger } from "~/utils/logger";
import { SENDOU_INK_BASE_URL } from "~/utils/urls";

export async function getICalendar(events: Array<CalendarEvent>) {
	// ical doesnt allow calendars with no events
	if (events.length === 0) {
		logger.warn("Could not construct ical feed, no events within time period");
		return null;
	}

	const { error, value } = eventsAsICal(events);

	if (error) {
		logger.error(`Error constructing ical feed: ${error}`);
		return null;
	}

	if (!value) {
		logger.error("Error constructing ical feed: no value returned");
		return null;
	}

	return value;
}

function eventsAsICal(events: Array<CalendarEvent>): ics.ReturnObject {
	return ics.createEvents(events.map(eventInfoAsICalEvent));
}

function eventInfoAsICalEvent(event: CalendarEvent): ics.EventAttributes {
	const startDate = new Date(event.at);
	const eventLink = `${SENDOU_INK_BASE_URL}/${event.url}`;

	return {
		title: event.name,
		start: [
			startDate.getUTCFullYear(),
			startDate.getUTCMonth() + 1,
			startDate.getUTCDate(),
			startDate.getUTCHours(),
			startDate.getUTCMinutes(),
		],
		startInputType: "utc",
		duration: { hours: 3 }, // arbitrary length
		url: eventLink,
		categories: event.tags,
		productId: "sendou.ink/calendar",
	};
}
