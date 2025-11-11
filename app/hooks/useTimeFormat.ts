import { useTranslation } from "react-i18next";
import { useUser } from "~/features/auth/core/user";

const H12_TIME_OPTIONS: Intl.DateTimeFormatOptions = {
	hour12: true,
	hourCycle: "h12" as const,
};
const H24_TIME_OPTIONS: Intl.DateTimeFormatOptions = {
	hour12: false,
	hourCycle: "h23" as const,
	minute: "2-digit",
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

	const language = () => {
		// this is needed to ensure the time format used doesn't say e.g. "03:00" when we want "3:00"
		if (clockFormat === "24h" && i18n.language === "en") {
			return "en-GB";
		}
		return i18n.language;
	};

	const formatDateTime = (date: Date, options?: Intl.DateTimeFormatOptions) => {
		return date.toLocaleString(
			language(),
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

	const formatTime = (date: Date, options?: Intl.DateTimeFormatOptions) => {
		return date.toLocaleTimeString(language(), {
			...options,
			...clockOptions,
		});
	};

	const formatDate = (date: Date, options?: Intl.DateTimeFormatOptions) => {
		return date.toLocaleDateString(language(), options);
	};

	return { formatDateTime, formatTime, formatDate };
}
