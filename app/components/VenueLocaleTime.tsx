import clsx from "clsx";
import { useVenueTimeFormat } from "~/hooks/intl/useVenueTimeFormat";
import { databaseTimestampToDate } from "~/utils/dates";
import { LocaleTime } from "./LocaleTime";
import styles from "./VenueLocaleTime.module.css";

/**
 * `LocaleTime` of an event: a LAN's in its venue's zone ("10:00 local") with the viewer's own underneath when it
 * reads differently. An online event (no `venueTimezone`) renders a plain `LocaleTime`.
 */
export function VenueLocaleTime({
	date,
	options,
	venueTimezone,
	className,
}: {
	/** `Date` or database timestamp */
	date: Date | number;
	options: Intl.DateTimeFormatOptions;
	venueTimezone: string | null | undefined;
	className?: string;
}) {
	const { format, isLoaded } = useVenueTimeFormat(options, venueTimezone);

	if (!venueTimezone) {
		return <LocaleTime date={date} options={options} className={className} />;
	}

	const dateObject =
		typeof date === "number" ? databaseTimestampToDate(date) : date;
	const { venue, viewer } = format(dateObject);

	return (
		<time
			// see `LocaleTime`
			suppressHydrationWarning
			dateTime={dateObject.toISOString()}
			className={clsx(styles.container, { invisible: !isLoaded }, className)}
		>
			<span>{venue}</span>
			{viewer ? <span className={styles.viewerTime}>{viewer}</span> : null}
		</time>
	);
}
