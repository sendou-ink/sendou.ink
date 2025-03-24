import type { LoaderFunctionArgs } from "@remix-run/node";
import { addMonths, subMonths } from "date-fns";
import type { PersistedCalendarEventTag } from "~/db/tables";
import { getUserId } from "~/features/auth/core/user.server";
import {
	dateToThisWeeksMonday,
	dateToThisWeeksSunday,
	dateToWeekNumber,
	weekNumberToDate,
} from "~/utils/dates";
import * as CalendarRepository from "../CalendarRepository.server";
import {
	loaderFilterSearchParamsSchema,
	loaderTournamentsOnlySearchParamsSchema,
	loaderWeekSearchParamsSchema,
} from "../calendar-schemas";
import { closeByWeeks } from "../calendar-utils";

export const loader = async ({ request }: LoaderFunctionArgs) => {
	const user = await getUserId(request);
	const url = new URL(request.url);

	// separate from tags parse so they can fail independently
	const parsedWeekParams = loaderWeekSearchParamsSchema.safeParse({
		year: url.searchParams.get("year"),
		week: url.searchParams.get("week"),
	});
	const parsedFilterParams = loaderFilterSearchParamsSchema.safeParse({
		tags: url.searchParams.get("tags"),
	});
	const parsedTournamentsOnlyParams =
		loaderTournamentsOnlySearchParamsSchema.safeParse({
			tournaments: url.searchParams.get("tournaments"),
		});

	const mondayDate = dateToThisWeeksMonday(new Date());
	const sundayDate = dateToThisWeeksSunday(new Date());
	const currentWeek = dateToWeekNumber(mondayDate);

	const displayedWeek = parsedWeekParams.success
		? parsedWeekParams.data.week
		: currentWeek;
	const displayedYear = parsedWeekParams.success
		? parsedWeekParams.data.year
		: currentWeek === 1 // handle first week of the year special case
			? sundayDate.getFullYear()
			: mondayDate.getFullYear();
	const tagsToFilterBy = parsedFilterParams.success
		? (parsedFilterParams.data.tags as PersistedCalendarEventTag[])
		: [];
	const onlyTournaments = parsedTournamentsOnlyParams.success
		? Boolean(parsedTournamentsOnlyParams.data.tournaments)
		: false;

	return {
		currentWeek,
		displayedWeek,
		currentDay: new Date().getDay(),
		nearbyStartTimes: await CalendarRepository.startTimesOfRange({
			startTime: subMonths(
				weekNumberToDate({ week: displayedWeek, year: displayedYear }),
				1,
			),
			endTime: addMonths(
				weekNumberToDate({ week: displayedWeek, year: displayedYear }),
				1,
			),
			tagsToFilterBy,
			onlyTournaments,
		}),
		weeks: closeByWeeks({ week: displayedWeek, year: displayedYear }),
		events: await fetchEventsOfWeek({
			week: displayedWeek,
			year: displayedYear,
			tagsToFilterBy,
			onlyTournaments,
		}),
		eventsToReport: user
			? await CalendarRepository.eventsToReport(user.id)
			: [],
	};
};

function fetchEventsOfWeek(args: {
	week: number;
	year: number;
	tagsToFilterBy: PersistedCalendarEventTag[];
	onlyTournaments: boolean;
}) {
	const startTime = weekNumberToDate(args);

	const endTime = new Date(startTime);
	endTime.setDate(endTime.getDate() + 7);

	// handle timezone mismatch between server and client
	startTime.setHours(startTime.getHours() - 12);
	endTime.setHours(endTime.getHours() + 12);

	return CalendarRepository.findAllBetweenTwoTimestamps({
		startTime,
		endTime,
		tagsToFilterBy: args.tagsToFilterBy,
		onlyTournaments: args.onlyTournaments,
	});
}
