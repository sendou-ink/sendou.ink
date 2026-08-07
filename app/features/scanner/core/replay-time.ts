/**
 * Turns the replay browser's on-screen recording timestamp (locale-formatted
 * by the console, e.g. "3/7/2026 22:28", "7.3.2026 22:28", "2026/3/7 22:28")
 * into a UTC epoch, read in the local timezone. The string carries no
 * timezone or day/month-order marker, so ambiguous day-vs-month (both ≤ 12)
 * resolves in three steps: hour 0 or ≥13 proves a 24h clock (12h consoles
 * render AM/PM) and 24h locales are near-universally day-first, except
 * en-US which is 12h; failing that, the browser locale's date-part order
 * decides; finally, since the console's locale and the browser's can still
 * disagree, a recency check swaps day/month when that reading lands near now
 * while the un-swapped one doesn't (replays are near-always ingested soon
 * after recording).
 */

const TIMESTAMP_RE =
	/^(\d{1,4})[./-](\d{1,4})[./-](\d{1,4})\s+(\d{1,2}):(\d{2})$/;

/** How far in the past a reading may land and still count as "recent". */
const RECENT_PAST_MS = 30 * 24 * 60 * 60 * 1000;
/** Forward tolerance for console-vs-browser clock and timezone skew. */
const FUTURE_SLACK_MS = 24 * 60 * 60 * 1000;

type Ymd = { year: number; month: number; day: number };

/**
 * Parses a replay timestamp into UTC epoch milliseconds, or null when the
 * string doesn't form a valid date. `locale` defaults to the environment's;
 * `now` (default `Date.now()`) anchors the recency disambiguation — pass the
 * moment the replay screen was on-screen, not the send time.
 */
export function parseReplayTimestamp(
	raw: string,
	{ locale, now }: { locale?: string; now?: number } = {},
): number | null {
	const m = TIMESTAMP_RE.exec(raw.trim());
	if (!m) return null;
	const dateParts = [Number(m[1]!), Number(m[2]!), Number(m[3]!)];
	const hours = Number(m[4]!);
	const minutes = Number(m[5]!);
	if (hours > 23 || minutes > 59) return null;

	// hour 0 or ≥13 only occurs on a 24h clock, and 24h locales are
	// near-universally day-first; only an ambiguous hour falls back to the
	// browser locale, which may not match the console's
	const is24hClock = hours === 0 || hours >= 13;
	const resolved = resolveDateParts(
		dateParts,
		is24hClock ? true : dayBeforeMonth(locale),
	);
	if (!resolved) return null;

	const preferred = toEpoch(resolved.preferred, hours, minutes);
	if (preferred === null) return null;

	if (resolved.swapped) {
		const swapped = toEpoch(resolved.swapped, hours, minutes);
		const ref = now ?? Date.now();
		if (
			swapped !== null &&
			isRecent(swapped, ref) &&
			!isRecent(preferred, ref)
		) {
			return swapped;
		}
	}
	return preferred;
}

function isRecent(t: number, ref: number): boolean {
	return t >= ref - RECENT_PAST_MS && t <= ref + FUTURE_SLACK_MS;
}

function toEpoch(
	{ year, month, day }: Ymd,
	hours: number,
	minutes: number,
): number | null {
	const date = new Date(year, month - 1, day, hours, minutes);
	// the Date constructor rolls invalid dates over (31/2 → 2/3); reject those
	if (
		date.getFullYear() !== year ||
		date.getMonth() !== month - 1 ||
		date.getDate() !== day
	) {
		return null;
	}
	return date.getTime();
}

/**
 * Splits the three date segments into year/month/day. The year is the
 * segment with ≥3 digits (leading for ja-style "2026/3/7", trailing
 * otherwise); with no such segment the last one is a 2-digit year. Day vs
 * month resolves by magnitude when one exceeds 12, else by the caller's
 * order guess (year-first formats are month-first — no locale writes Y/D/M);
 * a guessed split also reports the swapped reading for the recency check.
 */
function resolveDateParts(
	parts: number[],
	guessDayFirst: boolean,
): { preferred: Ymd; swapped: Ymd | null } | null {
	let year: number;
	let rest: [number, number];
	let dayFirst: boolean;
	let orderKnown = false;
	if (parts[0]! >= 100) {
		year = parts[0]!;
		rest = [parts[1]!, parts[2]!];
		dayFirst = false;
		orderKnown = true;
	} else {
		year = parts[2]! >= 100 ? parts[2]! : 2000 + parts[2]!;
		rest = [parts[0]!, parts[1]!];
		dayFirst = guessDayFirst;
	}

	const [a, b] = rest;
	let day: number;
	let month: number;
	let guessed = false;
	if (a > 12 && b > 12) return null;
	if (a > 12) [day, month] = [a, b];
	else if (b > 12) [month, day] = [a, b];
	else {
		[day, month] = dayFirst ? [a, b] : [b, a];
		guessed = !orderKnown && a !== b;
	}

	if (month < 1 || month > 12 || day < 1 || day > 31) return null;
	return {
		preferred: { year, month, day },
		swapped: guessed ? { year, month: day, day: month } : null,
	};
}

function dayBeforeMonth(locale: string | undefined): boolean {
	const parts = new Intl.DateTimeFormat(locale).formatToParts(
		new Date(2000, 0, 2),
	);
	const dayIndex = parts.findIndex((p) => p.type === "day");
	const monthIndex = parts.findIndex((p) => p.type === "month");
	return dayIndex !== -1 && monthIndex !== -1 && dayIndex < monthIndex;
}
