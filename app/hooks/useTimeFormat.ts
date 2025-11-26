import { useTranslation } from "react-i18next";
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
 * Hook for formatting dates and times according to user preferences and locale.
 * Respects the user's clock format preference (12h/24h) and current language.
 *
 * @example
 * const { formatDateTime, formatTime, formatDate } = useTimeFormat();
 *
 * // Format full date and time
 * formatDateTime(new Date('2025-01-15T14:30:00'));
 * // => "1/15/2025, 2:30 PM" (12h) or "1/15/2025, 14:30" (24h)
 *
 * // Format time only
 * formatTime(new Date('2025-01-15T14:30:00'));
 * // => "2:30 PM" (12h) or "14:30" (24h)
 *
 * // Format date only
 * formatDate(new Date('2025-01-15'));
 * // => "1/15/2025"
 *
 * // Custom options
 * formatDateTime(new Date(), { dateStyle: 'full', timeStyle: 'short' });
 * // => "Wednesday, January 15, 2025 at 2:30 PM"
 */
export function useTimeFormat() {
	const { i18n } = useTranslation();
	const user = useUser();
	const clockFormat = user?.preferences?.clockFormat;
	const clockOptions = getClockFormatOptions(clockFormat, i18n.language);

	const formatDateTime = (date: Date, options?: Intl.DateTimeFormatOptions) => {
		const result = date.toLocaleString(
			i18n.language,
			options?.hour
				? {
						...options,
						...clockOptions,
					}
				: {
						...options,
					},
		);
		return clockOptions.hourCycle === "h23" && options?.hour
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

	const formatDate = (date: Date, options?: Intl.DateTimeFormatOptions) => {
		return date.toLocaleDateString(i18n.language, options);
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

	return {
		formatDateTime,
		formatTime,
		formatDate,
		formatDateTimeSmartMinutes,
		formatDistanceToNow,
	};
}

// Example: "09:00" -> "9:00"
function stripLeadingZeroFromHour(timeString: string) {
	return timeString.replace(/\b0(\d:\d{2})/g, "$1");
}
