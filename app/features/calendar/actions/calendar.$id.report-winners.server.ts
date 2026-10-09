import { redirect } from "react-router";
import * as CalendarRepository from "~/features/calendar/CalendarRepository.server";
import { defineAction } from "~/form/define-action.server";
import { requirePermission } from "~/modules/permissions/guards.server";
import { notFoundIfNullish } from "~/utils/remix.server";
import { idObject } from "~/utils/schema";
import { calendarEventPage } from "~/utils/urls";
import { reportWinnersFormSchema } from "../calendar-report-winners-schemas";

export const action = defineAction(
	{ params: idObject, body: reportWinnersFormSchema },
	async ({ params: { id }, body }) => {
		const event = notFoundIfNullish(await CalendarRepository.findById(id));
		requirePermission(event, "REPORT_WINNERS");

		await CalendarRepository.upsertReportedScores({
			eventId: id,
			participantCount: body.participantCount,
			results: body.teams,
		});

		throw redirect(calendarEventPage(id));
	},
);
