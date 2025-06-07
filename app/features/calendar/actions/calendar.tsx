import { type ActionFunctionArgs, redirect } from "@remix-run/node";
import { requireUserId } from "~/features/auth/core/user.server";
import { calendarFiltersSearchParamsSchema } from "~/features/calendar/calendar-schemas";
import * as UserRepository from "~/features/user-page/UserRepository.server";
import {
	parseRequestPayload,
	parseSafeSearchParams,
} from "~/utils/remix.server";
import { calendarPage } from "~/utils/urls";
import { dayMonthYear } from "~/utils/zod";

export const action = async ({ request }: ActionFunctionArgs) => {
	const user = await requireUserId(request);
	const data = await parseRequestPayload({
		request,
		schema: calendarFiltersSearchParamsSchema,
	});

	await UserRepository.updatePreferences(user.id, {
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
