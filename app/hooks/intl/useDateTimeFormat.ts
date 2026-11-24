import { databaseTimestampToDate } from "~/utils/dates";
import { useUserIntlPreference } from "./useUserIntlPreference";

/** Rendered (via `invisible`) while the viewer's time zone is unknown to reserve one text line without an empty box's baseline quirks. */
const SSR_PLACEHOLDER = "\u200b";

/** Thin and narrow no-break spaces some ICU versions (Node's but not Chrome's) put around a range's dash or before AM/PM */
const ICU_SPACES_REGEX = /[\u2009\u202f]/g;

const SSR_FORMATTER = {
	format: (_date: Date | number) => SSR_PLACEHOLDER,
	formatRange: (_from: Date | number, _to: Date | number) => SSR_PLACEHOLDER,
};

/**
 * SSR-safe `Intl.DateTimeFormat` using `useUserIntlPreference`: the server renders the viewer's time zone and
 * language already, only on a device's very first visit the methods return a zero-width space placeholder until
 * hydration. Inputs are a `Date` or a database timestamp (`number`).
 *
 * Pass `wallClock` for dates built from local date parts (`new Date(year, month, day)`, date-fns `startOfDay`) to
 * format them in the zone they were built in, the server's own on the server.
 *
 * `timeZone` is the zone instants are formatted in (`undefined` = the browser's own), for deciding e.g. whether
 * two of them fall on the same day the same way on the server: `isSameDay(a, b, { in: tz(timeZone) })`.
 */
export function useDateTimeFormat(
	options: Intl.DateTimeFormatOptions,
	{ wallClock = false }: { wallClock?: boolean } = {},
) {
	const { language, hourCycle, timeZone, isLoaded } = useUserIntlPreference();

	const formatTimeZone = options.timeZone ?? (wallClock ? undefined : timeZone);

	// constructing an Intl.DateTimeFormat is expensive, so deferred to the first format call and cached
	const formatter = () =>
		cachedDateTimeFormat(language, {
			...options,
			timeZone: formatTimeZone,
			...(options.hour && hourCycle ? { hourCycle } : {}),
		});

	const realFormatter = {
		// the same text on the server and in the browser, a difference fails hydration
		format: (date: Date | number) => {
			return formatter()
				.format(typeof date === "number" ? databaseTimestampToDate(date) : date)
				.replace(ICU_SPACES_REGEX, " ");
		},
		formatRange: (from: Date | number, to: Date | number) => {
			return formatter()
				.formatRange(
					typeof from === "number" ? databaseTimestampToDate(from) : from,
					typeof to === "number" ? databaseTimestampToDate(to) : to,
				)
				.replace(ICU_SPACES_REGEX, " ");
		},
	};

	return {
		formatter: isLoaded ? realFormatter : SSR_FORMATTER,
		isLoaded,
		timeZone: formatTimeZone,
	};
}

const dateTimeFormatCache = new Map<string, Intl.DateTimeFormat>();

function cachedDateTimeFormat(
	language: string,
	options: Intl.DateTimeFormatOptions,
) {
	const key = `${language}\n${JSON.stringify(options)}`;
	let formatter = dateTimeFormatCache.get(key);
	if (!formatter) {
		formatter = new Intl.DateTimeFormat(language, options);
		dateTimeFormatCache.set(key, formatter);
	}

	return formatter;
}
