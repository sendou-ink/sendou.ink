import { useTranslation } from "react-i18next";
import { useDateTimeFormat } from "./useDateTimeFormat";

/**
 * Formats the times of an event held at a venue: `venue` is the time in the venue's zone ("10:00 local"), `viewer`
 * the viewer's own ("17:00 your time"), `null` when it reads the same. Without a venue zone (online event) `venue`
 * is `null` and `viewer` the plain time. SSR-safe like `useDateTimeFormat`.
 */
export function useVenueTimeFormat(
	options: Intl.DateTimeFormatOptions,
	venueTimezone: string | null | undefined,
) {
	const { t } = useTranslation(["common"]);
	const { formatter: venueFormatter, isLoaded } = useDateTimeFormat({
		...options,
		timeZone: venueTimezone ?? undefined,
	});
	const { formatter: viewerFormatter } = useDateTimeFormat(options);

	const format = (date: Date | number) => {
		const viewerTime = viewerFormatter.format(date);
		if (!venueTimezone) return { venue: null, viewer: viewerTime };

		const venueTime = venueFormatter.format(date);
		// keeps the SSR placeholder free of the "local" text
		if (!isLoaded) return { venue: venueTime, viewer: null };

		return {
			venue: t("common:venueTime.local", { time: venueTime }),
			viewer:
				venueTime === viewerTime
					? null
					: t("common:venueTime.viewer", { time: viewerTime }),
		};
	};

	return { format, isLoaded };
}
