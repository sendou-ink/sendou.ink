import { addDays, addWeeks, startOfWeek, subWeeks } from "date-fns";
import {
	dayMonthYearToLocalDate,
	localDateToDayMonthYear,
} from "~/utils/dates";
import type { DayMonthYear } from "~/utils/schema";
import { DAYS_SHOWN_AT_A_TIME } from "./calendar-constants";
import type { CalendarEvent } from "./calendar-types";

export const calendarEventMinDate = () => new Date(Date.UTC(2015, 4, 28));
export const calendarEventMaxDate = () => {
	const result = new Date();
	result.setFullYear(result.getFullYear() + 1);
	return result;
};

export function daysForCalendar(currentDate?: DayMonthYear) {
	const anchor = currentDate
		? dayMonthYearToLocalDate(currentDate)
		: new Date();
	const weekStart = startOfWeek(anchor, { weekStartsOn: 1 });

	return {
		previous: weekDays(subWeeks(weekStart, 1)),
		shown: weekDays(weekStart),
		next: weekDays(addWeeks(weekStart, 1)),
		current: localDateToDayMonthYear(anchor),
	};
}

function weekDays(weekStart: Date): Array<DayMonthYear> {
	return Array.from({ length: DAYS_SHOWN_AT_A_TIME }, (_, i) =>
		localDateToDayMonthYear(addDays(weekStart, i)),
	);
}

export function calendarEventSorter(a: CalendarEvent, b: CalendarEvent) {
	return b.normalizedTeamCount - a.normalizedTeamCount;
}
