import { type ActionFunctionArgs, redirect } from "react-router";
import { calendarFiltersSearchParamsSchema } from "~/features/calendar/calendar-schemas";
import * as UserRepository from "~/features/user-page/UserRepository.server";
import { parseFormData } from "~/form/parse.server";
import { parseSafeSearchParams } from "~/utils/remix.server";
import { calendarPage } from "~/utils/urls";
import { dayMonthYear } from "~/utils/zod";

export const action = async ({ request }: ActionFunctionArgs) => {
	const result = await parseFormData({
		request,
		schema: calendarFiltersSearchParamsSchema,
	});

	if (!result.success) {
		return { fieldErrors: result.fieldErrors };
	}

	await UserRepository.updateOwnPreferences({
		defaultCalendarFilters: result.data,
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
