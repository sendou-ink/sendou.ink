import clsx from "clsx";
import { useDateTimeFormat } from "~/hooks/intl/useDateTimeFormat";
import { databaseTimestampToDate } from "~/utils/dates";

interface LocaleTimeRangeProps {
	/** `Date` or database timestamp */
	from: Date | number;
	/** `Date` or database timestamp */
	to: Date | number;
	options: Intl.DateTimeFormatOptions;
	className?: string;
	/** defaults to block */
	inline?: boolean;
	"data-testid"?: string;
}

/**
 * Date range via `Intl.DateTimeFormat.formatRange` (locale-aware separators, shared parts
 * collapsed). Before the locale preference has loaded (SSR) the text is `invisible` but still
 * reserves one line of height to avoid layout shift.
 */
export function LocaleTimeRange({
	from,
	to,
	options,
	className,
	inline,
	"data-testid": testId,
}: LocaleTimeRangeProps) {
	const { formatter, isLoaded } = useDateTimeFormat(options);

	const fromDate =
		typeof from === "number" ? databaseTimestampToDate(from) : from;
	const toDate = typeof to === "number" ? databaseTimestampToDate(to) : to;

	return (
		<span
			data-testid={testId}
			className={clsx(
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
