import type { ActionFunction } from "react-router";
import { redirect } from "react-router";
import { requireUser } from "~/features/auth/core/user.server";
import * as CalendarRepository from "~/features/calendar/CalendarRepository.server";
import { parseFormData } from "~/form/parse.server";
import {
	errorToastIfFalsy,
	notFoundIfNullish,
	parseParams,
} from "~/utils/remix.server";
import { calendarEventPage } from "~/utils/urls";
import { idObject } from "~/utils/zod";
import { reportWinnersFormSchema } from "../calendar-schemas";
import { canReportCalendarEventWinners } from "../calendar-utils";

export const action: ActionFunction = async (args) => {
	const user = requireUser();
	const params = parseParams({
		params: args.params,
		schema: idObject,
	});
	const result = await parseFormData({
		request: args.request,
		schema: reportWinnersFormSchema,
	});

	if (!result.success) {
		return { fieldErrors: result.fieldErrors };
	}

	const event = notFoundIfNullish(await CalendarRepository.findById(params.id));
	errorToastIfFalsy(
		canReportCalendarEventWinners({
			user,
			event,
			startTimes: event.startTimes,
		}),
		"Unauthorized",
	);

	await CalendarRepository.upsertReportedScores({
		eventId: params.id,
		participantCount: result.data.participantCount,
		results: result.data.teams,
	});

	throw redirect(calendarEventPage(params.id));
};
