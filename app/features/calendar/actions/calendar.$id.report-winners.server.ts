import type { ActionFunction } from "react-router";
import { redirect } from "react-router";
import * as CalendarRepository from "~/features/calendar/CalendarRepository.server";
import { parseFormData } from "~/form/parse.server";
import { requirePermission } from "~/modules/permissions/guards.server";
import { notFoundIfNullish, parseParams } from "~/utils/remix.server";
import { idObject } from "~/utils/schema";
import { calendarEventPage } from "~/utils/urls";
import { reportWinnersFormSchema } from "../calendar-report-winners-schemas";

export const action: ActionFunction = async (args) => {
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
	requirePermission(event, "REPORT_WINNERS");

	await CalendarRepository.upsertReportedScores({
		eventId: params.id,
		participantCount: result.data.participantCount,
		results: result.data.teams,
	});

	throw redirect(calendarEventPage(params.id));
};
