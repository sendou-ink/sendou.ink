import { useTranslation } from "react-i18next";
import type { UserPreferences } from "~/db/tables";
import { useUser } from "~/features/auth/core/user";
import type { LanguageCode } from "~/modules/i18n/config";
import { formatDistanceToNow as formatDistanceToNowUtil } from "~/utils/dates";

const H12_TIME_OPTIONS: Intl.DateTimeFormatOptions = {
	hour12: true,
	hourCycle: "h12" as const,
};
const H24_TIME_OPTIONS: Intl.DateTimeFormatOptions = {
	hour12: false,
	hourCycle: "h23" as const,
};

const DATE_FORMAT_LOCALE: Record<
	Exclude<NonNullable<UserPreferences["dateFormat"]>, "auto">,
	string
> = {
	MDY: "en-US",
	DMY: "en-GB",
	YMD: "sv-SE",
};
function getClockFormatOptions(
	clockFormat: "auto" | "24h" | "12h" | undefined,
	language: string,
): Intl.DateTimeFormatOptions {
	if (!clockFormat || clockFormat === "auto") {
		const isEnglish = language === "en";
		if (isEnglish) {
			return H12_TIME_OPTIONS;
		}
		return H24_TIME_OPTIONS;
	}

	if (clockFormat === "24h") {
		return H24_TIME_OPTIONS;
	}

	return H12_TIME_OPTIONS;
}

/**
 * Hook for formatting date ranges, durations, and relative times
 * according to user preferences and locale.
 * Respects the user's clock format preference (12h/24h) and current language.
 *
 * For formatting a single date or time, prefer `LocaleTime` (for JSX) or
 * `useDateTimeFormat` (for non-JSX contexts).
 *
 * @example
 * const { formatDuration, formatRelativeTime } = useTimeFormat();
 *
 * // Format a duration (hours + minutes)
 * formatDuration(1, 30);
 * // => "1h 30m" (en) or locale-appropriate narrow format
 *
 * // Format relative time (picks the largest significant unit)
 * formatRelativeTime(2, 15);
 * // => "in 2 hr."
 * formatRelativeTime(0, 45);
 * // => "in 45 min."
 */
export function useTimeFormat() {
	const { i18n } = useTranslation();
	const user = useUser();
	const clockFormat = user?.preferences?.clockFormat;
	const dateFormat = user?.preferences?.dateFormat;
	const clockOptions = getClockFormatOptions(clockFormat, i18n.language);
	const dateLocale = getDateLocale(dateFormat, i18n.language);

	const formatDateTime = (date: Date, options?: Intl.DateTimeFormatOptions) => {
		const adjusted = withYearFirstAdjustment(options, dateFormat);
		const useDateLocale = isNumericMonth(adjusted);
		const hasTimePart = Boolean(adjusted?.hour);

		// When the user's date-format preference forces a non-language locale (e.g. sv-SE
		// for YMD), applying it to the full date+time would also pull in that locale's
		// time conventions — most visibly Swedish "fm"/"em" instead of "AM"/"PM".
		// Format the date and time portions separately to keep them locale-correct.
		if (hasTimePart && useDateLocale && dateLocale !== i18n.language) {
			const { hour, minute, second, timeZoneName, ...dateOptions } = adjusted!;
			const datePart = date.toLocaleDateString(dateLocale, dateOptions);
			const timePart = formatTime(date, { hour, minute, second, timeZoneName });
			return `${datePart}, ${timePart}`;
		}

		const result = date.toLocaleString(
			useDateLocale ? dateLocale : i18n.language,
			hasTimePart
				? {
						...adjusted,
						...clockOptions,
					}
				: {
						...adjusted,
					},
		);
		return clockOptions.hourCycle === "h23" && hasTimePart
			? stripLeadingZeroFromHour(result)
			: result;
	};

	const formatTime = (
		date: Date,
		options: Intl.DateTimeFormatOptions = {
			hour: "numeric",
			minute: "2-digit",
		},
	) => {
		const result = date.toLocaleTimeString(i18n.language, {
			...options,
			...clockOptions,
		});
		return clockOptions.hourCycle === "h23"
			? stripLeadingZeroFromHour(result)
			: result;
	};

	const formatDateRange = (
		from: Date,
		to: Date,
		options?: Intl.DateTimeFormatOptions,
	) => {
		const adjusted = withYearFirstAdjustment(options, dateFormat);
		const locale = isNumericMonth(adjusted) ? dateLocale : i18n.language;
		return new Intl.DateTimeFormat(locale, adjusted)
			.formatRange(from, to)
			.replace(/\s*–\s*/g, " – ");
	};

	/** Same as `formatDateTime` but omits minutes when they are zero and AM/PM format is in use */
	const formatDateTimeSmartMinutes = (
		date: Date,
		options?: Intl.DateTimeFormatOptions,
	) => {
		const showMinutes =
			date.getMinutes() !== 0 ||
			clockFormat === "24h" ||
			i18n.language !== "en";

		return formatDateTime(date, {
			...options,
			minute: showMinutes ? "numeric" : undefined,
		});
	};

	const formatDistanceToNow = (
		date: Parameters<typeof formatDistanceToNowUtil>[0],
		options?: Omit<Parameters<typeof formatDistanceToNowUtil>[1], "language">,
	) => {
		return formatDistanceToNowUtil(date, {
			...options,
			language: i18n.language as LanguageCode,
		});
	};

	const formatDuration = (hours: number, minutes: number) => {
		return new Intl.DurationFormat(i18n.language, { style: "narrow" }).format({
			hours,
			minutes,
		});
	};

	const formatRelativeTime = (hours: number, minutes: number) => {
		const rtf = new Intl.RelativeTimeFormat(i18n.language, { style: "short" });

		if (hours > 0) {
			return rtf.format(hours, "hour");
		}

		return rtf.format(minutes, "minute");
	};

	return {
		formatDateRange,
		formatDateTimeSmartMinutes,
		formatDistanceToNow,
		formatDuration,
		formatRelativeTime,
	};
}

// Example: "09:00" -> "9:00"
function stripLeadingZeroFromHour(timeString: string) {
	return timeString.replace(/\b0(\d:\d{2})/g, "$1");
}

function getDateLocale(
	dateFormat: UserPreferences["dateFormat"] | undefined,
	language: string,
) {
	if (!dateFormat || dateFormat === "auto") return language;
	return DATE_FORMAT_LOCALE[dateFormat];
}

function isNumericMonth(options: Intl.DateTimeFormatOptions | undefined) {
	if (!options?.month) return false;
	return options.month === "numeric" || options.month === "2-digit";
}

function withYearFirstAdjustment(
	options: Intl.DateTimeFormatOptions | undefined,
	dateFormat: UserPreferences["dateFormat"] | undefined,
): Intl.DateTimeFormatOptions | undefined {
	if (options?.year !== "2-digit") return options;
	if (dateFormat !== "YMD") return options;
	return { ...options, year: "numeric" };
}
