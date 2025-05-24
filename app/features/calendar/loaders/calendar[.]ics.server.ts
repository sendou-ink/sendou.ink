import type { LoaderFunctionArgs } from "@remix-run/node";
import type { PersistedCalendarEventTag } from "~/db/tables";
import {
	loaderFilterSearchParamsSchema,
	loaderTournamentsOnlySearchParamsSchema,
} from "../calendar-schemas";
import * as ical from "../core/ical";

export const loader = async ({ request }: LoaderFunctionArgs) => {
	const url = new URL(request.url);

	// allows limiting calendar events to specific tags
	const parsedFilterParams = loaderFilterSearchParamsSchema.safeParse({
		tags: url.searchParams.get("tags"),
	});
	const parsedTournamentsOnlyParams =
		loaderTournamentsOnlySearchParamsSchema.safeParse({
			tournaments: url.searchParams.get("tournaments"),
		});

	const tagsToFilterBy = parsedFilterParams.success
		? (parsedFilterParams.data.tags as PersistedCalendarEventTag[])
		: [];
	const onlyTournaments = parsedTournamentsOnlyParams.success
		? Boolean(parsedTournamentsOnlyParams.data.tournaments)
		: false;

	const iCalData = await ical.getICalendar({
		tagsFilter: tagsToFilterBy,
		tournamentsFilter: onlyTournaments,
	});

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
