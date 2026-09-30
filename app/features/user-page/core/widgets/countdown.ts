import { differenceInSeconds } from "date-fns";

const SECONDS_IN_MINUTE = 60;
const SECONDS_IN_HOUR = 60 * SECONDS_IN_MINUTE;
const SECONDS_IN_DAY = 24 * SECONDS_IN_HOUR;

export interface CountdownParts {
	days: number;
	hours: number;
	minutes: number;
	seconds: number;
}

/** Time left from `now` until `target` split into whole days, hours, minutes and seconds. `null` once the target has passed. */
export function remainingUntil(now: Date, target: Date): CountdownParts | null {
	const totalSeconds = differenceInSeconds(target, now);
	if (totalSeconds <= 0) return null;

	return {
		days: Math.floor(totalSeconds / SECONDS_IN_DAY),
		hours: Math.floor((totalSeconds % SECONDS_IN_DAY) / SECONDS_IN_HOUR),
		minutes: Math.floor((totalSeconds % SECONDS_IN_HOUR) / SECONDS_IN_MINUTE),
		seconds: totalSeconds % SECONDS_IN_MINUTE,
	};
}
