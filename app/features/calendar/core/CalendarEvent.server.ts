import type {
	CalendarEvent,
	CalendarFilters,
	GroupedCalendarEvents,
} from "../calendar-types";

// xxx: add jsdocs to these

export function applyFilters(
	events: {
		at: number;
		events: Array<CalendarEvent>;
	}[],
	_filters: CalendarFilters,
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

export function defaultFilters(): CalendarFilters {
	return {
		tagsIncluded: null,
		tagsExcluded: null,
		onlySendouHosted: null,
	};
}
