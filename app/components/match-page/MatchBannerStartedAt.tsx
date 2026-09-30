import { LocaleTime } from "~/components/LocaleTime";
import { LocaleTimeRange } from "~/components/LocaleTimeRange";

const FORMAT_OPTIONS: Intl.DateTimeFormatOptions = {
	month: "numeric",
	year: "2-digit",
	day: "numeric",
	hour: "numeric",
	minute: "numeric",
};

const CLASS_NAME = "text-lighter font-semi-bold";

interface MatchBannerStartedAtProps {
	time: Date;
	/** shown as a range together with the start time */
	endTime?: Date | null;
}

export function MatchBannerStartedAt({
	time,
	endTime,
}: MatchBannerStartedAtProps) {
	if (endTime) {
		return (
			<LocaleTimeRange
				from={time}
				to={endTime}
				options={FORMAT_OPTIONS}
				className={CLASS_NAME}
				inline
			/>
		);
	}

	return (
		<LocaleTime
			date={time}
			options={FORMAT_OPTIONS}
			className={CLASS_NAME}
			inline
		/>
	);
}
