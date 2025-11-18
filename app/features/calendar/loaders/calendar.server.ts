import type { LoaderFunctionArgs } from "@remix-run/node";
import { add, sub } from "date-fns";
import type { UserPreferences } from "~/db/tables";
import { getUser } from "~/features/auth/core/user.server";
import { DAYS_SHOWN_AT_A_TIME } from "~/features/calendar/calendar-constants";
import {
	calendarFiltersSearchParamsObject,
	calendarFiltersSearchParamsSchema,
} from "~/features/calendar/calendar-schemas";
import type { SerializeFrom } from "~/utils/remix";
import { parseSafeSearchParams, parseSearchParams } from "~/utils/remix.server";
import { dayMonthYear } from "~/utils/zod";
import * as CalendarRepository from "../CalendarRepository.server";
import * as CalendarEvent from "../core/CalendarEvent";

export type CalendarLoaderData = SerializeFrom<typeof loader>;

export const loader = async (args: LoaderFunctionArgs) => {
	const user = await getUser(args.request);
	const parsed = parseSafeSearchParams({
		request: args.request,
		schema: dayMonthYear,
	});

	const date = parsed.success
		? new Date(
				Date.UTC(parsed.data.year, parsed.data.month, parsed.data.day),
			).getTime()
		: Date.now();

	const events = await CalendarRepository.findAllBetweenTwoTimestamps({
		// add a bit of tolerance to the timestamps to account for timezones
		startTime: sub(new Date(date), { hours: 24 }),
		endTime: add(new Date(date), { days: DAYS_SHOWN_AT_A_TIME + 1 }),
	});

	const filters = resolveFilters(args.request, user?.preferences);
	const filtered = CalendarEvent.applyFilters(events, filters);

	return {
		eventTimes: filtered,
		dateViewed: parsed.success ? parsed.data : undefined,
		filters,
	};
};

function resolveFilters(
	request: Request,
	preferences?: UserPreferences | null,
) {
	const parsed = parseSearchParams({
		request,
		schema: calendarFiltersSearchParamsObject,
	}).filters;

	if (!CalendarEvent.isDefaultFilters(parsed)) {
		return parsed;
	}

	if (preferences?.defaultCalendarFilters) {
		// make sure the saved values still match current reality
		const parsedDefault = calendarFiltersSearchParamsSchema.parse(
			preferences.defaultCalendarFilters,
		);

		return parsedDefault;
	}

	return CalendarEvent.defaultFilters();
}
