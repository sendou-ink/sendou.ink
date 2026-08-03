import { z } from "zod";
import * as SearchParams from "~/modules/search-params/search-params";
import { SP } from "~/modules/search-params/search-params";
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
	day: SP.param(z.number().int().min(1).max(31).nullable(), {
		default: null,
		loader: true,
	}),
	month: SP.param(z.number().int().min(0).max(11).nullable(), {
		default: null,
		loader: true,
	}),
	year: SP.param(z.number().int().min(2015).max(2100).nullable(), {
		default: null,
		loader: true,
	}),
});

export const calendarEventsSearchParams = SearchParams.define({
	view: SP.param(z.enum(VIEW_FILTERS).nullable(), {
		default: null,
		loader: false,
	}),
});

export const calendarNewSearchParams = SearchParams.define({
	eventId: SP.param(z.number().int().positive().nullable(), {
		default: null,
		loader: true,
	}),
	copyEventId: SP.param(z.number().int().positive().nullable(), {
		default: null,
		loader: true,
	}),
	tournament: SP.param(z.boolean(), {
		default: false,
		loader: true,
	}),
});
