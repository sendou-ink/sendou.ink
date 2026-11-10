import { isToday, isTomorrow } from "date-fns";
import { useTranslation } from "react-i18next";
import { useDateTimeFormat } from "~/hooks/intl/useDateTimeFormat";

/**
 * Formats dates relative to the viewer's current day ("Today", "Tomorrow") in the site language,
 * falling back to a short date for any other day.
 */
export function useRelativeDayFormat() {
	const { i18n } = useTranslation();
	const { formatter: timeFormatter } = useDateTimeFormat({
		hour: "numeric",
		minute: "numeric",
	});
	const { formatter: dateTimeFormatter } = useDateTimeFormat({
		month: "numeric",
		day: "numeric",
		hour: "numeric",
		minute: "numeric",
	});

	/** "Today" / "Tomorrow", null for any other day */
	const relativeDayLabel = (date: Date) => {
		const daysFromToday = isToday(date) ? 0 : isTomorrow(date) ? 1 : null;
		if (daysFromToday === null) return null;

		const rtf = new Intl.RelativeTimeFormat(i18n.language, { numeric: "auto" });
		const str = rtf.format(daysFromToday, "day");
		return str.charAt(0).toUpperCase() + str.slice(1);
	};

	/** "Today, 18:00" or a short date time, taking a database timestamp */
	const formatRelativeDate = (timestamp: number) => {
		const date = new Date(timestamp * 1000);
		const dayLabel = relativeDayLabel(date);

		if (dayLabel) {
			return `${dayLabel}, ${timeFormatter.format(date)}`;
		}

		return dateTimeFormatter.format(date);
	};

	return { relativeDayLabel, formatRelativeDate };
}
