import type { SerializeFrom } from "~/utils/remix";
import * as CalendarRepository from "../CalendarRepository.server";

export type CalendarLoaderData = SerializeFrom<typeof loader>;

export const loader = async () => {
	const now = Date.now();

	// xxx: we could probably load less
	const twentyFourHoursAgo = now - 24 * 60 * 60 * 1000;
	const sixDaysFromNow = now + 5 * 24 * 60 * 60 * 1000;

	return {
		events: await CalendarRepository.findAllBetweenTwoTimestamps({
			startTime: new Date(twentyFourHoursAgo),
			endTime: new Date(sixDaysFromNow),
		}),
	};
};
