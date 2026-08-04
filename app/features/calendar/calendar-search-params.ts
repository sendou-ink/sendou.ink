import { z } from "zod";
import * as SearchParams from "~/modules/search-params/search-params";
import { SP } from "~/modules/search-params/search-params";
import { dayMonthYear } from "~/utils/zod";
import { calendarFiltersSearchParamsSchema } from "./calendar-schemas";
import * as CalendarEvent from "./core/CalendarEvent";

export const VIEW_FILTERS = [
	"registered",
	"hosting",
	"scrims",
	"saved",
	"organization",
] as const;
export type ViewFilter = (typeof VIEW_FILTERS)[number];

export const calendarSearchParams = SearchParams.define({
	filters: SP.json(calendarFiltersSearchParamsSchema, {
		default: CalendarEvent.defaultFilters(),
		loader: true,
	}),
	day: SP.param(dayMonthYear.shape.day.nullable(), { loader: true }),
	month: SP.param(dayMonthYear.shape.month.nullable(), { loader: true }),
	year: SP.param(dayMonthYear.shape.year.nullable(), { loader: true }),
});

export const calendarEventsSearchParams = SearchParams.define({
	view: SP.param(z.enum(VIEW_FILTERS).nullable(), { loader: false }),
});

export const calendarNewSearchParams = SearchParams.define({
	eventId: SP.param(z.number().int().positive().nullable(), { loader: true }),
	copyEventId: SP.param(z.number().int().positive().nullable(), {
		loader: true,
	}),
	tournament: SP.param(z.boolean(), {
		default: false,
		loader: true,
	}),
});
