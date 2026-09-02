import { databaseTimestampToDate } from "~/utils/dates";
import { useUserIntlPreference } from "./useUserIntlPreference";

/** Rendered (via `invisible`) during SSR to reserve one text line without an empty box's baseline quirks. */
const SSR_PLACEHOLDER = "\u200b";

const SSR_FORMATTER = {
	format: (_date: Date | number) => SSR_PLACEHOLDER,
	formatRange: (_from: Date | number, _to: Date | number) => SSR_PLACEHOLDER,
};

/**
 * SSR-safe `Intl.DateTimeFormat` using `useUserIntlPreference`. Before hydration the methods return a
 * zero-width space placeholder. Inputs are a `Date` or a database timestamp (`number`).
 */
export function useDateTimeFormat(options: Intl.DateTimeFormatOptions) {
	const { language, hourCycle, isLoaded } = useUserIntlPreference();

	// constructing an Intl.DateTimeFormat is expensive, so deferred to the first format call and cached
	const formatter = () =>
		cachedDateTimeFormat(language, {
			...options,
			...(options.hour && hourCycle ? { hourCycle } : {}),
		});

	const realFormatter = {
		format: (date: Date | number) => {
			return formatter().format(
				typeof date === "number" ? databaseTimestampToDate(date) : date,
			);
		},
		formatRange: (from: Date | number, to: Date | number) => {
			return formatter().formatRange(
				typeof from === "number" ? databaseTimestampToDate(from) : from,
				typeof to === "number" ? databaseTimestampToDate(to) : to,
			);
		},
	};

	return {
		formatter: isLoaded ? realFormatter : SSR_FORMATTER,
		isLoaded,
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
