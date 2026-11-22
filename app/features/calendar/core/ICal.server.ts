/**
 * iCalendar (.ics) feeds calendar apps subscribe to: the public feed of the
 * calendar page and each user's personal feed of their own events.
 */
import { addHours } from "date-fns";
import * as ics from "ics";
import type { CalendarEvent } from "~/features/calendar/calendar-types";
import type { SidebarEvent } from "~/features/sidebar/core/sidebar.server";
import { logger } from "~/utils/logger";
import { SENDOU_INK_BASE_URL } from "~/utils/urls";

/** Events without an end of their own get an arbitrary length. */
const DURATION_HOURS: Record<SidebarEvent["type"], number> = {
	tournament: 3,
	scrim: 2,
	teamEvent: 2,
	leagueMatch: 1,
	lobby: 2,
};

export interface Event {
	/** Stable across fetches so calendar apps update the event instead of duplicating it. */
	uid: string;
	title: string;
	/** Timestamp in milliseconds */
	startsAt: number;
	/** Timestamp in milliseconds */
	endsAt: number;
	/** Relative URL of the event's page */
	url: string;
	categories?: string[];
}

/** iCalendar text of a feed, `null` if it couldn't be built. */
export function feed({
	productId,
	name,
	events,
}: {
	productId: string;
	/** Name calendar apps show for the subscribed calendar, by default the subscription URL */
	name?: string;
	events: Array<Event>;
}) {
	const { error, value } = ics.createEvents(events.map(toICalEventAttributes), {
		productId,
		calName: name,
	});

	if (error || !value) {
		logger.error(`Error constructing ical feed: ${error ?? "no value"}`);
		return null;
	}

	return value;
}

/** One day of a calendar page event as a feed event. */
export function fromCalendarEvent(event: CalendarEvent): Event {
	return {
		uid: `event-${event.id}-${event.at}@sendou.ink`,
		title: event.name,
		startsAt: event.at,
		endsAt: addHours(event.at, DURATION_HOURS.tournament).getTime(),
		url: event.url,
		categories: event.tags,
	};
}

/** An event of the user's events page as a feed event. */
export function fromSidebarEvent(event: SidebarEvent): Event {
	const startsAt = event.startsAt * 1000;

	return {
		uid: `${event.type}-${event.id}@sendou.ink`,
		title: event.type === "scrim" ? `Scrim vs. ${event.name}` : event.name,
		startsAt,
		endsAt: event.endsAt
			? event.endsAt * 1000
			: addHours(startsAt, DURATION_HOURS[event.type]).getTime(),
		url: event.url,
	};
}

function toICalEventAttributes(event: Event): ics.EventAttributes {
	return {
		uid: event.uid,
		title: event.title,
		start: event.startsAt,
		end: event.endsAt,
		url: `${SENDOU_INK_BASE_URL}${event.url}`,
		categories: event.categories,
	};
}
