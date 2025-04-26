import type { LoaderFunctionArgs } from "@remix-run/node";
import { requireUserId } from "~/features/auth/core/user.server";
import * as CalendarRepository from "~/features/calendar/CalendarRepository.server";
import { notFoundIfFalsy, unauthorizedIfFalsy } from "~/utils/remix.server";
import { reportWinnersParamsSchema } from "../calendar-schemas";
import { canReportCalendarEventWinners } from "../calendar-utils";

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
	const parsedParams = reportWinnersParamsSchema.parse(params);
	const user = await requireUserId(request);
	const event = notFoundIfFalsy(
		await CalendarRepository.findById({ id: parsedParams.id }),
	);

	unauthorizedIfFalsy(
		canReportCalendarEventWinners({
			user,
			event,
			startTimes: event.startTimes,
		}),
	);

	return {
		name: event.name,
		participantCount: event.participantCount,
		winners: await CalendarRepository.findResultsByEventId(parsedParams.id),
	};
};
