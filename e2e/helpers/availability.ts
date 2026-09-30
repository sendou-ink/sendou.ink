import * as R from "remeda";
import * as Availability from "~/features/availability/core/Availability";
import { MACHINE_TIMEZONE } from "./playwright";

const DAY_SECONDS = 24 * 60 * 60;

/** The week `date` (default: now) falls in, as the test machine's timezone sees it. */
export function weekRange(date = new Date()) {
	return Availability.weekRange(date, MACHINE_TIMEZONE);
}

/** The seven `YYYY-MM-DD` dates of the week `date` (default: now) falls in. */
export function weekDates(date = new Date()) {
	const { startsAt } = weekRange(date);

	return R.range(0, 7).map((dayIndex) =>
		Availability.dateInTimezone(
			startsAt + dayIndex * DAY_SECONDS + DAY_SECONDS / 2,
			MACHINE_TIMEZONE,
		),
	);
}
