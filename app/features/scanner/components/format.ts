import { useDateTimeFormat } from "~/hooks/intl/useDateTimeFormat";

/** hh:mm:ss for feed rows, CSV cells, and scan progress. */
export function formatTime(t: number): string {
	const h = Math.floor(t / 3600);
	const m = Math.floor((t % 3600) / 60);
	const s = Math.floor(t % 60);
	return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/** the match timer's M:SS (215 → "3:35") */
export function formatClock(seconds: number): string {
	const m = Math.floor(seconds / 60);
	const s = Math.floor(seconds % 60);
	return `${m}:${String(s).padStart(2, "0")}`;
}

/**
 * Locale-aware time-of-day formatter for detection timestamps (epoch ms)
 * shown in scanner cards, in place of a raw `toLocaleTimeString()` call.
 */
export function useEventTimeFormatter(): (ms: number) => string {
	const { formatter } = useDateTimeFormat({ timeStyle: "medium" });
	return (ms: number) => formatter.format(new Date(ms));
}

/**
 * Locale-aware date+time formatter for absolute timestamps (epoch ms), e.g.
 * a saved VoD's scan time, in place of a raw `toLocaleString()` call.
 */
export function useEventDateTimeFormatter(): (ms: number) => string {
	const { formatter } = useDateTimeFormat({
		dateStyle: "medium",
		timeStyle: "medium",
	});
	return (ms: number) => formatter.format(new Date(ms));
}
