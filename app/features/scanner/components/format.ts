import { useDateTimeFormat } from "~/hooks/intl/useDateTimeFormat";

/** Locale-aware time-of-day formatter for detection timestamps (epoch ms). */
export function useEventTimeFormatter(): (ms: number) => string {
	const { formatter } = useDateTimeFormat({ timeStyle: "medium" });
	return (ms: number) => formatter.format(new Date(ms));
}

/** Locale-aware date+time formatter for absolute timestamps (epoch ms), e.g. a VoD's scan time. */
export function useEventDateTimeFormatter(): (ms: number) => string {
	const { formatter } = useDateTimeFormat({
		dateStyle: "medium",
		timeStyle: "medium",
	});
	return (ms: number) => formatter.format(new Date(ms));
}
