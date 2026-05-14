import clsx from "clsx";
import { useDateTimeFormat } from "~/hooks/intl/useDateTimeFormat";
import { databaseTimestampToDate } from "~/utils/dates";

interface LocaleTimeProps {
	date: Date | number;
	options: Intl.DateTimeFormatOptions;
	className?: string;
	inline?: boolean;
}

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
				"reserve-one-lb",
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
