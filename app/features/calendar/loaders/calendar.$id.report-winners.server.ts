import type { LoaderFunctionArgs } from "@remix-run/node";
import { requireUserId } from "~/features/auth/core/user.server";
import * as CalendarRepository from "~/features/calendar/CalendarRepository.server";
import {
	notFoundIfFalsy,
	parseParams,
	unauthorizedIfFalsy,
} from "~/utils/remix.server";
import { idObject } from "~/utils/zod";
import { canReportCalendarEventWinners } from "../calendar-utils";

export const loader = async (args: LoaderFunctionArgs) => {
	const params = parseParams({
		params: args.params,
		schema: idObject,
	});
	const user = await requireUserId(args.request);
	const event = notFoundIfFalsy(
		await CalendarRepository.findById({ id: params.id }),
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
		winners: await CalendarRepository.findResultsByEventId(params.id),
	};
};
