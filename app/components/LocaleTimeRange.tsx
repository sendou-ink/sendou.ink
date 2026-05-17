import clsx from "clsx";
import { useDateTimeFormat } from "~/hooks/intl/useDateTimeFormat";
import { databaseTimestampToDate } from "~/utils/dates";

interface LocaleTimeRangeProps {
	/** Start of the range. Accepts a `Date` or a database timestamp (number), which is converted via `databaseTimestampToDate`. */
	from: Date | number;
	/** End of the range. Accepts a `Date` or a database timestamp (number), which is converted via `databaseTimestampToDate`. */
	to: Date | number;
	/** Formatting options forwarded to `Intl.DateTimeFormat`. Combined with the user's locale and hour cycle preferences. */
	options: Intl.DateTimeFormatOptions;
	/** Optional extra class names appended to the rendered element. */
	className?: string;
	/** When `true`, renders inline; otherwise the element is displayed as a block. Defaults to block. */
	inline?: boolean;
}

/**
 * Renders the given date range formatted according to the user's locale preferences,
 * using `Intl.DateTimeFormat.prototype.formatRange` for locale-aware separators and
 * collapsing of shared parts (e.g. the year when both bounds share it).
 *
 * During SSR and before the user's locale preference has loaded the formatted text is hidden
 * (via `invisible`) while still reserving one line of height to avoid layout shift on hydration.
 */
export function LocaleTimeRange({
	from,
	to,
	options,
	className,
	inline,
}: LocaleTimeRangeProps) {
	const { formatter, isLoaded } = useDateTimeFormat(options);

	const fromDate =
		typeof from === "number" ? databaseTimestampToDate(from) : from;
	const toDate = typeof to === "number" ? databaseTimestampToDate(to) : to;

	return (
		<span
			className={clsx(
				"reserve-one-lb",
				{
					block: !inline,
					invisible: !isLoaded,
				},
				className,
			)}
		>
			{formatter.formatRange(fromDate, toDate)}
		</span>
	);
}
