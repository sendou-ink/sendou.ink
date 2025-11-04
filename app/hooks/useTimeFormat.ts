import { useTranslation } from "react-i18next";
import { useUser } from "~/features/auth/core/user";

function getClockFormatOptions(
	clockFormat: "auto" | "24h" | "12h" | undefined,
	language: string,
): Intl.DateTimeFormatOptions {
	if (!clockFormat || clockFormat === "auto") {
		const isEnglish = language === "en";
		if (isEnglish) {
			return { hour12: true, hourCycle: "h12" as const };
		}
		return { hour12: false, hourCycle: "h23" as const, minute: "2-digit" };
	}

	if (clockFormat === "24h") {
		return { hour12: false, hourCycle: "h23" as const, minute: "2-digit" };
	}

	return { hour12: true, hourCycle: "h12" as const };
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
		return date.toLocaleString(i18n.language, { ...options, ...clockOptions });
	};

	const formatTime = (date: Date, options?: Intl.DateTimeFormatOptions) => {
		return date.toLocaleTimeString(
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
	};

	const formatDate = (date: Date, options?: Intl.DateTimeFormatOptions) => {
		return date.toLocaleDateString(i18n.language, options);
	};

	return { formatDateTime, formatTime, formatDate };
}
