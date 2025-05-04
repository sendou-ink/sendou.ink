import type { CalendarEvent, GroupedCalendarEvents } from "../calendar-types";

export function applyFilters(
	events: {
		at: number;
		events: Array<CalendarEvent>;
	}[],
	_filters: unknown,
): Array<GroupedCalendarEvents> {
	return events.map((event) => {
		const shown: CalendarEvent[] = [];
		const hidden: CalendarEvent[] = [];

		for (const calendarEvent of event.events) {
			if (typeof calendarEvent.isRanked === "boolean") {
				shown.push(calendarEvent);
			} else {
				hidden.push(calendarEvent);
			}
		}

		return {
			at: event.at,
			events: {
				shown,
				hidden,
			},
		};
	});
}
