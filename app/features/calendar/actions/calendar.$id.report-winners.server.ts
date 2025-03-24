import type { ActionFunction } from "@remix-run/node";
import { redirect } from "@remix-run/node";
import { requireUserId } from "~/features/auth/core/user.server";
import * as CalendarRepository from "~/features/calendar/CalendarRepository.server";
import { canReportCalendarEventWinners } from "~/permissions";
import {
	errorToastIfFalsy,
	notFoundIfFalsy,
	safeParseRequestFormData,
} from "~/utils/remix.server";
import { calendarEventPage } from "~/utils/urls";
import {
	reportWinnersActionSchema,
	reportWinnersParamsSchema,
} from "../calendar-schemas";

export const action: ActionFunction = async ({ request, params }) => {
	const user = await requireUserId(request);
	const parsedParams = reportWinnersParamsSchema.parse(params);
	const parsedInput = await safeParseRequestFormData({
		request,
		schema: reportWinnersActionSchema,
	});

	if (!parsedInput.success) {
		return {
			errors: parsedInput.errors,
		};
	}

	const event = notFoundIfFalsy(
		await CalendarRepository.findById({ id: parsedParams.id }),
	);
	errorToastIfFalsy(
		canReportCalendarEventWinners({
			user,
			event,
			startTimes: event.startTimes,
		}),
		"Unauthorized",
	);

	await CalendarRepository.upsertReportedScores({
		eventId: parsedParams.id,
		participantCount: parsedInput.data.participantCount,
		results: parsedInput.data.team.map((t) => ({
			teamName: t.teamName,
			placement: t.placement,
			players: t.players.map((p) => ({
				userId: typeof p === "string" ? null : p.id,
				name: typeof p === "string" ? p : null,
			})),
		})),
	});

	throw redirect(calendarEventPage(parsedParams.id));
};
