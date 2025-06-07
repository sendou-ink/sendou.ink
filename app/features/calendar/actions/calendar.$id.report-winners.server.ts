import type { ActionFunction } from "@remix-run/node";
import { redirect } from "@remix-run/node";
import { requireUserId } from "~/features/auth/core/user.server";
import * as CalendarRepository from "~/features/calendar/CalendarRepository.server";
import {
	errorToastIfFalsy,
	notFoundIfFalsy,
	parseParams,
	safeParseRequestFormData,
} from "~/utils/remix.server";
import { calendarEventPage } from "~/utils/urls";
import { idObject } from "~/utils/zod";
import { reportWinnersActionSchema } from "../calendar-schemas";
import { canReportCalendarEventWinners } from "../calendar-utils";

export const action: ActionFunction = async (args) => {
	const user = await requireUserId(args.request);
	const params = parseParams({
		params: args.params,
		schema: idObject,
	});
	const parsedInput = await safeParseRequestFormData({
		request: args.request,
		schema: reportWinnersActionSchema,
	});

	if (!parsedInput.success) {
		return {
			errors: parsedInput.errors,
		};
	}

	const event = notFoundIfFalsy(
		await CalendarRepository.findById({ id: params.id }),
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
		eventId: params.id,
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

	throw redirect(calendarEventPage(params.id));
};
