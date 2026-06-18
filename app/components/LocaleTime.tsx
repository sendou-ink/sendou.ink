import clsx from "clsx";
import { useDateTimeFormat } from "~/hooks/intl/useDateTimeFormat";
import { databaseTimestampToDate } from "~/utils/dates";

interface LocaleTimeProps {
	/** The date to render. Accepts a `Date` or a database timestamp (number), which is converted via `databaseTimestampToDate`. */
	date: Date | number;
	/** Formatting options forwarded to `Intl.DateTimeFormat`. Combined with the user's locale and hour cycle preferences. */
	options: Intl.DateTimeFormatOptions;
	/** Optional extra class names appended to the rendered `<time>` element. */
	className?: string;
	/** When `true`, renders inline; otherwise the element is displayed as a block. Defaults to block. */
	inline?: boolean;
}

/**
 * Renders a `<time>` element with the given date formatted according to the user's locale preferences.
 *
 * During SSR and before the user's locale preference has loaded the formatted text is hidden
 * (via `invisible`) while still reserving one line of height to avoid layout shift on hydration.
 * The `dateTime` attribute is always set to the ISO string for machine readability and a11y.
 */
export function LocaleTime({
	date,
	options,
	className,
	inline,
}: LocaleTimeProps) {
	const { formatter, isLoaded } = useDateTimeFormat(options);

	const dateObject =
		typeof date === "number" ? databaseTimestampToDate(date) : date;

	return (
		<time
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
