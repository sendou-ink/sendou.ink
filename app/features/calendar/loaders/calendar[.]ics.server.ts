import type { LoaderFunctionArgs } from "react-router";
import * as R from "remeda";
import * as v from "valibot";
import { safeJSONParse } from "~/utils/schema";
import * as CalendarRepository from "../CalendarRepository.server";
import { calendarFiltersSearchParamsSchema } from "../calendar-schemas";
import { calendarSearchParams } from "../calendar-search-params";
import * as CalendarEvent from "../core/CalendarEvent";
import * as ICal from "../core/ICal.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
	const filters = resolveFilters(request);

	const startTime = new Date();
	const endTime = new Date(startTime);

	// get all events over the two weeks, might be good to make this an parameter in the future
	endTime.setDate(startTime.getDate() + 14);

	// handle timezone mismatch between server and client
	startTime.setHours(startTime.getHours() - 12);
	endTime.setHours(endTime.getHours() + 12);

	const events = await CalendarRepository.findAllBetweenTwoTimestamps({
		startTime,
		endTime,
	});

	const filtered = CalendarEvent.applyFilters(events, filters);

	const iCalData = await ICal.getICalendar(
		filtered.flatMap((eventTime) => eventTime.events.shown),
	);

	if (iCalData === null) {
		return new Response(null, { status: 204 });
	}

	return new Response(iCalData, {
		status: 200,
		headers: {
			"Content-Type": "text/calendar",
		},
	});
};

/** Subscribed feed URLs may still carry the pre-FilterBar `filters` JSON param. */
function resolveFilters(request: Request) {
	// biome-ignore lint/plugin: legacy param no current route produces
	const legacyFilters = new URL(request.url).searchParams.get("filters");
	if (legacyFilters !== null) {
		const parsed = v.safeParse(
			calendarFiltersSearchParamsSchema,
			safeJSONParse(legacyFilters),
		);
		if (parsed.success) return parsed.output;
	}

	return R.pick(calendarSearchParams.parse(request), [
		...CalendarEvent.FILTERS_KEYS,
	]);
}
