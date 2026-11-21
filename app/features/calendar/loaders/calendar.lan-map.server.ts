import * as CalendarRepository from "~/features/calendar/CalendarRepository.server";

export type LanMapLoaderData = typeof loader;

export const loader = async () => {
	return { lans: await CalendarRepository.findAllUpcomingWithVenue() };
};
