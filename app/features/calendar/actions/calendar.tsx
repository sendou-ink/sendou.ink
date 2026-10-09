import { redirect } from "react-router";
import { calendarFiltersSearchParamsSchema } from "~/features/calendar/calendar-schemas";
import { calendarSearchParams } from "~/features/calendar/calendar-search-params";
import { calendarPage } from "~/features/calendar/calendar-urls";
import * as UserRepository from "~/features/user-page/UserRepository.server";
import { defineAction } from "~/form/define-action.server";

export const action = defineAction(
	{ body: calendarFiltersSearchParamsSchema },
	async ({ body, request }) => {
		await UserRepository.updateOwnPreferences({
			defaultCalendarFilters: body,
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
	},
);
