import * as ics from "ics";
import type { PersistedCalendarEventTag } from "~/db/tables";
import { databaseTimestampToDate } from "~/utils/dates";
import { logger } from "~/utils/logger";
import { CALENDAR_PAGE, SENDOU_INK_BASE_URL } from "~/utils/urls";
import {
	type FindAllBetweenTwoTimestampsItem,
	findAllBetweenTwoTimestamps,
} from "../CalendarRepository.server";

export async function getICalendar(
	{
		tagsFilter,
		tournamentsFilter,
	}: {
		tagsFilter: Array<PersistedCalendarEventTag>;
		tournamentsFilter: boolean;
	} = { tagsFilter: [], tournamentsFilter: false },
): Promise<string | null> {
	const startTime = new Date();
	const endTime = new Date(startTime);

	// get all events over the next month, might be good to make this an parameter in the future
	endTime.setDate(startTime.getDate() + 30);

	// handle timezone mismatch between server and client
	startTime.setHours(startTime.getHours() - 12);
	endTime.setHours(endTime.getHours() + 12);

	const events = await findAllBetweenTwoTimestamps({
		startTime,
		endTime,
		tagsToFilterBy: tagsFilter,
		onlyTournaments: tournamentsFilter,
	});

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

	return value as string;
}

export function eventsAsICal(
	events: Array<FindAllBetweenTwoTimestampsItem>,
): ics.ReturnObject {
	return ics.createEvents(events.map(eventInfoAsICalEvent));
}

export function eventInfoAsICalEvent(
	event: FindAllBetweenTwoTimestampsItem,
): ics.EventAttributes {
	const startDate = databaseTimestampToDate(event.startTime);
	const eventLink = `${SENDOU_INK_BASE_URL}${CALENDAR_PAGE}/${event.eventId}`;
	const tags = event.tags;

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
		categories: tags,
		productId: "sendou.ink/calendar",
	};
}
