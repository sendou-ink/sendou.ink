import type { LoaderFunctionArgs } from "@remix-run/node";
import { getUserId } from "~/features/auth/core/user.server";
import * as CalendarRepository from "~/features/calendar/CalendarRepository.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
	const user = await getUserId(request);
	const url = new URL(request.url);
	const calendarEventId = url.searchParams.get("eventId");

	const event = calendarEventId
		? await CalendarRepository.findById({
				id: Number(calendarEventId),
				includeMapPool: true,
			})
		: undefined;

	return {
		calendarEvent: event
			? {
					id: event.eventId,
					name: event.name,
					mapPool: event.mapPool,
				}
			: undefined,
		recentEventsWithMapPools: user
			? await CalendarRepository.findRecentMapPoolsByAuthorId(user.id)
			: undefined,
	};
};
