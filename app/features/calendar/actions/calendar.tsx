import { type ActionFunctionArgs, redirect } from "react-router";
import { calendarFiltersSearchParamsSchema } from "~/features/calendar/calendar-schemas";
import * as UserRepository from "~/features/user-page/UserRepository.server";
import {
	parseRequestPayload,
	parseSafeSearchParams,
} from "~/utils/remix.server";
import { calendarPage } from "~/utils/urls";
import { dayMonthYear } from "~/utils/zod";

export const action = async ({ request }: ActionFunctionArgs) => {
	const data = await parseRequestPayload({
		request,
		schema: calendarFiltersSearchParamsSchema,
	});

	await UserRepository.updateOwnPreferences({
		defaultCalendarFilters: data,
	});

	const parsedSearchParams = parseSafeSearchParams({
		request,
		schema: dayMonthYear,
	});

	return redirect(
		calendarPage({
			dayMonthYear: parsedSearchParams.success
				? parsedSearchParams.data
				: undefined,
		}),
	);
};
