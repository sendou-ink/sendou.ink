import clsx from "clsx";
import { useDateTimeFormat } from "~/hooks/intl/useDateTimeFormat";
import { databaseTimestampToDate } from "~/utils/dates";

interface LocaleTimeProps {
	date: Date | number;
	options: Intl.DateTimeFormatOptions;
	className?: string;
}

export function LocaleTime({ date, options, className }: LocaleTimeProps) {
	const { formatter, className: formatterClassName } =
		useDateTimeFormat(options);

	const dateObject =
		typeof date === "number" ? databaseTimestampToDate(date) : date;

	return (
		<time
			dateTime={dateObject.toISOString()}
			className={clsx(formatterClassName, className)}
		>
			{formatter.format(dateObject)}
		</time>
	);
}
