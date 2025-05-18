import { type LoaderFunctionArgs, json } from "@remix-run/node";
import { cors } from "remix-utils/cors";
import { z } from "zod";
import * as CalendarRepository from "~/features/calendar/CalendarRepository.server";
import { databaseTimestampToDate, weekNumberToDate } from "~/utils/dates";
import { parseParams } from "~/utils/remix.server";
import {
	handleOptionsRequest,
	requireBearerAuth,
} from "../api-public-utils.server";
import type { GetCalendarWeekResponse } from "../schema";

const paramsSchema = z.object({
	year: z.coerce.number().int().min(2020).max(2100),
	week: z.coerce.number().int().min(1).max(53),
});

export const loader = async ({ params, request }: LoaderFunctionArgs) => {
	await handleOptionsRequest(request);
	requireBearerAuth(request);

	const { week, year } = parseParams({ params, schema: paramsSchema });

	const events = await fetchEventsOfWeek({
		week,
		year,
	});

	const result: GetCalendarWeekResponse = events.map((event) => ({
		name: event.name,
		startTime: databaseTimestampToDate(event.startTime).toISOString(),
		tournamentId: event.tournamentId,
		tournamentUrl: event.tournamentId
			? `https://sendou.ink/to/${event.tournamentId}/brackets`
			: null,
	}));

	return await cors(request, json(result));
};

function fetchEventsOfWeek(args: { week: number; year: number }) {
	const startTime = weekNumberToDate(args);

	const endTime = new Date(startTime);
	endTime.setDate(endTime.getDate() + 7);

	return CalendarRepository.findAllBetweenTwoTimestamps({
		startTime,
		endTime,
		tagsToFilterBy: [],
		onlyTournaments: false,
	});
}
