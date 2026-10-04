import { useDateTimeFormat } from "~/hooks/intl/useDateTimeFormat";

/** Locale-aware date+time formatter for absolute timestamps (epoch ms), e.g. a VoD's scan time. */
export function useEventDateTimeFormatter(): (ms: number) => string {
	const { formatter } = useDateTimeFormat({
		dateStyle: "medium",
		timeStyle: "medium",
	});
	return (ms: number) => formatter.format(new Date(ms));
}
