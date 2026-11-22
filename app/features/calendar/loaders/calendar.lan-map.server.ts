import * as CalendarRepository from "~/features/calendar/CalendarRepository.server";
import * as LanVenue from "../core/LanVenue";

export type LanMapLoaderData = typeof loader;

export const loader = async () => {
	const lans = await CalendarRepository.findAllUpcomingWithVenue();

	return { lans: LanVenue.firstPerLocation(lans) };
};
