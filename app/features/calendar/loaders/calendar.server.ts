import { add, startOfWeek, sub } from "date-fns";
import type { LoaderFunctionArgs } from "react-router";
import * as R from "remeda";
import * as v from "valibot";
import type { UserPreferences } from "~/db/tables-json";
import { getUser } from "~/features/auth/core/user.server";
import { DAYS_SHOWN_AT_A_TIME } from "~/features/calendar/calendar-constants";
import { calendarFiltersSearchParamsSchema } from "~/features/calendar/calendar-schemas";
import { calendarSearchParams } from "~/features/calendar/calendar-search-params";
import { canAccessTrophies } from "~/features/trophies/trophies-utils";
import type { SerializeFrom } from "~/utils/remix";
import * as CalendarRepository from "../CalendarRepository.server";
import * as CalendarEvent from "../core/CalendarEvent";

export type CalendarLoaderData = SerializeFrom<typeof loader>;

export const loader = async (args: LoaderFunctionArgs) => {
	const user = getUser();
	const { day, month, year } = calendarSearchParams.parse(args.request);

	const dateViewed =
		typeof day === "number" &&
		typeof month === "number" &&
		typeof year === "number"
			? { day, month, year }
			: undefined;

	const date = dateViewed
		? new Date(
				Date.UTC(dateViewed.year, dateViewed.month, dateViewed.day),
			).getTime()
		: Date.now();

	const weekStart = startOfWeek(new Date(date), { weekStartsOn: 1 });
	const events = await CalendarRepository.findAllBetweenTwoTimestamps({
		// on the default view the client resolves the shown week from its own clock,
		// which around the week boundary can be a full week ahead of or behind the
		// server's week, so fetch wide enough to cover every timezone's current week
		startTime: sub(weekStart, { days: DAYS_SHOWN_AT_A_TIME + 1 }),
		endTime: add(weekStart, { days: DAYS_SHOWN_AT_A_TIME * 2 + 1 }),
	});

	const filters = resolveFilters(args.request, user?.preferences);
	const filtered = CalendarEvent.applyFilters(events, filters);

	const canSaveAsDefault =
		user != null &&
		!R.isDeepEqual(
			filters,
			user.preferences?.defaultCalendarFilters
				? v.parse(
						calendarFiltersSearchParamsSchema,
						user.preferences.defaultCalendarFilters,
					)
				: CalendarEvent.defaultFilters(),
		);

	const eventTimes = canAccessTrophies(user)
		? filtered
		: filtered.map((time) => ({
				...time,
				events: {
					shown: time.events.shown.map((event) => ({
						...event,
						trophy: null,
					})),
					hidden: time.events.hidden.map((event) => ({
						...event,
						trophy: null,
					})),
				},
			}));

	return {
		eventTimes,
		dateViewed,
		filters,
		canSaveAsDefault,
	};
};

function resolveFilters(
	request: Request,
	preferences?: UserPreferences | null,
) {
	const searchParams = calendarSearchParams.parse(request);
	const parsed = R.pick(searchParams, [...CalendarEvent.FILTERS_KEYS]);

	// the user cleared or edited the filters, so the URL is the whole truth
	// even when it ends up holding no filters at all
	if (!searchParams.useDefaults) {
		return parsed;
	}

	if (!CalendarEvent.isDefaultFilters(parsed)) {
		return parsed;
	}

	if (preferences?.defaultCalendarFilters) {
		// make sure the saved values still match current reality
		const parsedDefault = v.parse(
			calendarFiltersSearchParamsSchema,
			preferences.defaultCalendarFilters,
		);

		return parsedDefault;
	}

	return CalendarEvent.defaultFilters();
}
