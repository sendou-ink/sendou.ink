import type { DayMonthYear } from "~/utils/schema";
import { CALENDAR_PAGE, SENDOU_INK_BASE_URL } from "~/utils/urls";
import {
	calendarNewSearchParams,
	calendarSearchParams,
} from "./calendar-search-params";
import type { CalendarFilters } from "./calendar-types";

export const calendarPage = (args?: { dayMonthYear?: DayMonthYear }) =>
	calendarSearchParams.href(CALENDAR_PAGE, {
		...(args?.dayMonthYear
			? {
					day: args.dayMonthYear.day,
					month: args.dayMonthYear.month,
					year: args.dayMonthYear.year,
				}
			: {}),
	});

export const calendarIcalFeed = (filters?: CalendarFilters) =>
	calendarSearchParams.href(`${SENDOU_INK_BASE_URL}/calendar.ics`, {
		...(filters ?? {}),
	});

export const calendarEditPage = (eventId?: number) =>
	calendarNewSearchParams.href("/calendar/new", {
		eventId: eventId ?? null,
	});

export const tournamentEditPage = (eventId: number) =>
	calendarNewSearchParams.href("/calendar/new", {
		eventId,
		tournament: true,
	});
