import clsx from "clsx";
import { useVenueTimeFormat } from "~/hooks/intl/useVenueTimeFormat";
import { databaseTimestampToDate } from "~/utils/dates";
import { LocaleTime } from "./LocaleTime";
import { LocaleTimeRange } from "./LocaleTimeRange";
import styles from "./VenueLocaleTime.module.css";

/**
 * `LocaleTime` of an event: a LAN's in its venue's zone ("10:00 local") with the viewer's own underneath (or after
 * it in brackets when `inline`) when it reads differently. With `to` it's a range like `LocaleTimeRange`. An online
 * event (no `venueTimezone`) renders a plain `LocaleTime` / `LocaleTimeRange`.
 */
export function VenueLocaleTime({
	date,
	to,
	options,
	venueTimezone,
	className,
	inline,
}: {
	/** `Date` or database timestamp */
	date: Date | number;
	/** End of the range, `Date` or database timestamp */
	to?: Date | number;
	options: Intl.DateTimeFormatOptions;
	venueTimezone: string | null | undefined;
	className?: string;
	inline?: boolean;
}) {
	const { format, formatRange, isLoaded } = useVenueTimeFormat(
		options,
		venueTimezone,
	);

	if (!venueTimezone) {
		return to === undefined ? (
			<LocaleTime
				date={date}
				options={options}
				className={className}
				inline={inline}
			/>
		) : (
			<LocaleTimeRange
				from={date}
				to={to}
				options={options}
				className={className}
				inline={inline}
			/>
		);
	}

	const dateObject =
		typeof date === "number" ? databaseTimestampToDate(date) : date;
	const { venue, viewer } =
		to === undefined
			? format(dateObject)
			: formatRange(
					dateObject,
					typeof to === "number" ? databaseTimestampToDate(to) : to,
				);

	return (
		<time
			// see `LocaleTime`
			suppressHydrationWarning
			dateTime={dateObject.toISOString()}
			className={clsx(
				{ [styles.container]: !inline, invisible: !isLoaded },
				className,
			)}
		>
			<span>{venue}</span>
			{viewer ? (
				inline ? (
					` (${viewer})`
				) : (
					<span className={styles.viewerTime}>{viewer}</span>
				)
			) : null}
		</time>
	);
}
