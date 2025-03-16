import type { SerializeFrom } from "@remix-run/node";
import * as CalendarRepository from "~/features/calendar/CalendarRepository.server";

export const loader = async () => {
	return {
		events: await CalendarRepository.allEventsWithMapPools(),
	};
};

export type EventsWithMapPoolsLoaderData = SerializeFrom<typeof loader>;
export type SerializedMapPoolEvent =
	EventsWithMapPoolsLoaderData["events"][number];
