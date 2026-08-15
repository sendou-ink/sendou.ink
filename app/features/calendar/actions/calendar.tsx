import { type ActionFunctionArgs, redirect } from "react-router";
import { calendarFiltersSearchParamsSchema } from "~/features/calendar/calendar-schemas";
import { calendarSearchParams } from "~/features/calendar/calendar-search-params";
import { calendarPage } from "~/features/calendar/calendar-urls";
import * as UserRepository from "~/features/user-page/UserRepository.server";
import { parseFormData } from "~/form/parse.server";

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

	const { day, month, year } = calendarSearchParams.parse(request);

	return redirect(
		calendarPage({
			dayMonthYear:
				typeof day === "number" &&
				typeof month === "number" &&
				typeof year === "number"
					? { day, month, year }
					: undefined,
		}),
	);
};
