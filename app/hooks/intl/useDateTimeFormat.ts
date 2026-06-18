import { databaseTimestampToDate } from "~/utils/dates";
import { useUserIntlPreference } from "./useUserIntlPreference";

/**
 * Zero-width space rendered (hidden via `invisible`) during SSR so the element
 * reserves exactly one normal text line, avoiding layout shift on hydration
 * without an empty box's baseline quirks.
 */
const SSR_PLACEHOLDER = "\u200b";

const SSR_FORMATTER = {
	format: (_date: Date | number) => SSR_PLACEHOLDER,
	formatRange: (_from: Date | number, _to: Date | number) => SSR_PLACEHOLDER,
};

/**
 * SSR-safe wrapper around `Intl.DateTimeFormat`.
 *
 * Uses the user's locale and hour cycle preferences via `useUserIntlPreference`.
 * Before hydration the returned formatter's methods return a zero-width space
 * placeholder so that server output matches the initial client render while
 * reserving one text line.
 *
 * Inputs accept either a `Date` or a database timestamp (`number`); numbers
 * are converted via `databaseTimestampToDate`.
 */
export function useDateTimeFormat(options: Intl.DateTimeFormatOptions) {
	const { language, hourCycle, isLoaded } = useUserIntlPreference();

	const formatter = new Intl.DateTimeFormat(language, {
		...options,
		...(options.hour && hourCycle ? { hourCycle } : {}),
	});

	const realFormatter = {
		format: (date: Date | number) => {
			return formatter.format(
				typeof date === "number" ? databaseTimestampToDate(date) : date,
			);
		},
		formatRange: (from: Date | number, to: Date | number) => {
			return formatter.formatRange(
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
