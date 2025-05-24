import type { LoaderFunctionArgs } from "@remix-run/node";
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

	const twentyFourHoursAgo = date - 24 * 60 * 60 * 1000;
	const fiveDaysFromNow = date + DAYS_SHOWN_AT_A_TIME * 24 * 60 * 60 * 1000;

	const events = await CalendarRepository.findAllBetweenTwoTimestamps({
		startTime: new Date(twentyFourHoursAgo),
		endTime: new Date(fiveDaysFromNow),
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
