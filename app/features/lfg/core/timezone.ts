import { TIMEZONES } from "../lfg-constants";

/** Hours between the local clock times of two timezones, wrapped to [-12, 12]. */
export function hourDifferenceBetweenTimezones(
	timezone1: string,
	timezone2: string,
) {
	const rawDifference =
		(getTimezoneOffset(timezone1) - getTimezoneOffset(timezone2)) / 60;

	// wrap to [-12, 12] so timezones across the date line compare by local clock time
	return ((((rawDifference + 12) % 24) + 24) % 24) - 12;
}

/** Timezones whose local clock is at most `maxHourDifference` hours from the viewer's. */
export function timezonesWithinHours(
	viewerTimezone: string,
	maxHourDifference: number,
) {
	return TIMEZONES.filter(
		(timezone) =>
			Math.abs(hourDifferenceBetweenTimezones(timezone, viewerTimezone)) <=
			maxHourDifference,
	);
}

const HOUR_IN_MS = 60 * 60 * 1000;

// building a formatter is the expensive part of resolving an offset and one stays valid forever
const formatters = new Map<string, Intl.DateTimeFormat>();
// offsets change only at DST transitions, which happen on the hour
const offsetsThisHour = new Map<string, { hour: number; offset: number }>();

function getTimezoneOffset(timeZone: string) {
	const hour = Math.floor(Date.now() / HOUR_IN_MS);

	const cached = offsetsThisHour.get(timeZone);
	if (cached?.hour === hour) return cached.offset;

	const offset = resolveTimezoneOffset(timeZone);
	offsetsThisHour.set(timeZone, { hour, offset });

	return offset;
}

// https://stackoverflow.com/a/29268535
function resolveTimezoneOffset(timeZone: string) {
	const date = new Date();

	let formatter = formatters.get(timeZone);
	if (!formatter) {
		formatter = new Intl.DateTimeFormat("en-CA", {
			timeZone,
			hourCycle: "h23",
			year: "numeric",
			month: "2-digit",
			day: "2-digit",
			hour: "2-digit",
			minute: "2-digit",
			second: "2-digit",
		});
		formatters.set(timeZone, formatter);
	}

	const parts = Object.fromEntries(
		formatter.formatToParts(date).map((part) => [part.type, part.value]),
	);

	// the time zone's local wall clock read as if it was UTC
	const lie = Date.UTC(
		Number(parts.year),
		Number(parts.month) - 1,
		Number(parts.day),
		Number(parts.hour),
		Number(parts.minute),
		Number(parts.second),
		date.getMilliseconds(),
	);

	// minutes, positive West of GMT (opposite of ISO 8601) like `Date.getTimezoneOffset`
	return -(lie - date.getTime()) / 60 / 1000;
}
