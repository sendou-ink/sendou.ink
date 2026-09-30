import clsx from "clsx";
import { useDateTimeFormat } from "~/hooks/intl/useDateTimeFormat";
import { databaseTimestampToDate } from "~/utils/dates";

interface LocaleTimeProps {
	/** `Date` or database timestamp */
	date: Date | number;
	options: Intl.DateTimeFormatOptions;
	className?: string;
	/** defaults to block */
	inline?: boolean;
	"data-testid"?: string;
}

/**
 * `<time>` formatted per the user's locale preferences. Before the preference has loaded (SSR)
 * the text is `invisible` but still reserves one line of height to avoid layout shift.
 */
export function LocaleTime({
	date,
	options,
	className,
	inline,
	"data-testid": testId,
}: LocaleTimeProps) {
	const { formatter, isLoaded } = useDateTimeFormat(options);

	const dateObject =
		typeof date === "number" ? databaseTimestampToDate(date) : date;

	return (
		<time
			// a live "now" value (e.g. a clock) differs slightly between server and client render,
			// which would mismatch `dateTime`; fixed dates are deterministic so nothing real is masked
			suppressHydrationWarning
			data-testid={testId}
			dateTime={dateObject.toISOString()}
			className={clsx(
				{
					block: !inline,
					invisible: !isLoaded,
				},
				className,
			)}
		>
			{formatter.format(dateObject)}
		</time>
	);
}
