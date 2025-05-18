import type { LoaderFunctionArgs } from "@remix-run/node";
import { DAYS_SHOWN_AT_A_TIME } from "~/features/calendar/calendar-constants";
import { calendarFiltersSchema } from "~/features/calendar/calendar-schemas";
import type { SerializeFrom } from "~/utils/remix";
import { parseSafeSearchParams } from "~/utils/remix.server";
import { dayMonthYear } from "~/utils/zod";
import * as CalendarRepository from "../CalendarRepository.server";
import * as CalendarEvent from "../core/CalendarEvent.server";

export type CalendarLoaderData = SerializeFrom<typeof loader>;

export const loader = async (args: LoaderFunctionArgs) => {
	const parsed = parseSafeSearchParams({
		request: args.request,
		schema: dayMonthYear,
	});

	const date = parsed.success
		? new Date(
				Date.UTC(parsed.data.year, parsed.data.month, parsed.data.day),
			).getTime()
		: Date.now();

	const twentyFourHoursAgo = date - 24 * 60 * 60 * 1000;
	const fiveDaysFromNow = date + DAYS_SHOWN_AT_A_TIME * 24 * 60 * 60 * 1000;

	const events = await CalendarRepository.findAllBetweenTwoTimestamps({
		startTime: new Date(twentyFourHoursAgo),
		endTime: new Date(fiveDaysFromNow),
	});

	const filters = resolveFilters(args.request);
	const filtered = CalendarEvent.applyFilters(events, filters);

	return {
		eventTimes: filtered,
		dateViewed: parsed.success ? parsed.data : undefined,
		filters,
	};
};

function resolveFilters(request: Request) {
	const parsed = parseSafeSearchParams({
		request,
		schema: calendarFiltersSchema,
	});

	if (parsed.success) {
		return parsed.data;
	}

	return CalendarEvent.defaultFilters();
}
