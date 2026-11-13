/**
 * Time ranges of reported availability as absolute timestamps: the weeks they are reported for as a
 * timezone sees them, the range arithmetic taking commitments out of them, how one person fits an
 * event's window and the windows enough members of a roster are free for together.
 */
import { TZDate } from "@date-fns/tz";
import {
	addWeeks,
	format,
	getISOWeek,
	isMonday,
	isSunday,
	startOfWeek,
} from "date-fns";
import * as R from "remeda";
import {
	databaseTimestampToJavascriptTimestamp,
	dateToDatabaseTimestamp,
} from "~/utils/dates";
import { invariant } from "~/utils/invariant";
import { AVAILABILITY } from "../availability-constants";
import type {
	BusyBlock,
	MemberAvailability,
	PlayableWindow,
	TimeRange,
	WindowAvailability,
} from "../availability-types";

const MINUTE_IN_SECONDS = 60;

/** Database timestamp of the Monday 00:00 starting the week `date` falls in, as seen in `timezone`. */
export function weekStartsAt(date: Date, timezone: string) {
	const zoned = new TZDate(date.getTime(), timezone);

	return dateToDatabaseTimestamp(startOfWeek(zoned, { weekStartsOn: 1 }));
}

/**
 * The week `date` falls in, `endsAt` being the next Monday 00:00. Not always 7×24h:
 * a week with a DST transition is an hour shorter or longer.
 */
export function weekRange(date: Date, timezone: string): TimeRange {
	const zoned = new TZDate(date.getTime(), timezone);
	const start = startOfWeek(zoned, { weekStartsOn: 1 });

	return {
		startsAt: dateToDatabaseTimestamp(start),
		endsAt: dateToDatabaseTimestamp(addWeeks(start, 1)),
	};
}

/** Whether `date` falls on the first day of its week (Monday), as the week is seen in `timezone`. */
export function isFirstDayOfWeek(date: Date, timezone: string) {
	return isMonday(new TZDate(date.getTime(), timezone));
}

/** Whether `date` falls on the last day of its week (Sunday), as the week is seen in `timezone`. */
export function isLastDayOfWeek(date: Date, timezone: string) {
	return isSunday(new TZDate(date.getTime(), timezone));
}

/** ISO week number of the week the timestamp falls in, as seen in `timezone`. */
export function isoWeekNumber(timestamp: number, timezone: string) {
	return getISOWeek(inTimezone(timestamp, timezone));
}

/** Whether the two week starts name the same week: closer than timezones can set them apart (hours, never days). */
export function isSameWeek(weekStart: number, rangeStartsAt: number) {
	return (
		Math.abs(weekStart - rangeStartsAt) <
		AVAILABILITY.WEEK_MATCH_MAX_DISTANCE_SECONDS
	);
}

/** Database timestamp of `date` (`YYYY-MM-DD`) at `time` (`HH:mm`) in `timezone`. */
export function localToTimestamp({
	date,
	time,
	timezone,
}: {
	date: string;
	time: string;
	timezone: string;
}) {
	const [year, month, day] = date.split("-").map(Number);
	const [hours, minutes] = time.split(":").map(Number);

	invariant(
		[year, month, day, hours, minutes].every((part) => Number.isFinite(part)),
		`Malformed local time: ${date} ${time}`,
	);

	return dateToDatabaseTimestamp(
		new TZDate(year, month - 1, day, hours, minutes, 0, timezone),
	);
}

/**
 * `YYYY-MM-DD` of the timestamp in `timezone`. A slot's day depends on who is looking,
 * so it is always resolved from the timestamp, never from the day its author entered it on.
 */
export function dateInTimezone(timestamp: number, timezone: string) {
	return format(inTimezone(timestamp, timezone), "yyyy-MM-dd");
}

/** `HH:mm` of the timestamp in `timezone`. */
export function timeInTimezone(timestamp: number, timezone: string) {
	return format(inTimezone(timestamp, timezone), "HH:mm");
}

/**
 * `YYYY-MM-DD` in `to` of a day saved as a date in `from`, mapped through that day's
 * noon in case the viewer has since moved. How day notes find their viewer-local day.
 */
export function dateAcrossTimezones({
	date,
	from,
	to,
}: {
	date: string;
	from: string;
	to: string;
}) {
	return dateInTimezone(
		localToTimestamp({ date, time: "12:00", timezone: from }),
		to,
	);
}

/** Whether the two ranges share any time at all. Ranges that merely touch do not overlap. */
export function overlaps(one: TimeRange, other: TimeRange) {
	return one.startsAt < other.endsAt && other.startsAt < one.endsAt;
}

/** The ranges sorted and merged so that no two overlap or touch. Empty ranges are dropped. */
export function normalize(ranges: Array<TimeRange>): Array<TimeRange> {
	const sorted = R.sortBy(
		ranges.filter((range) => range.endsAt > range.startsAt),
		(range) => range.startsAt,
	);

	const merged: Array<TimeRange> = [];
	for (const range of sorted) {
		const previous = merged[merged.length - 1];

		if (previous && range.startsAt <= previous.endsAt) {
			previous.endsAt = Math.max(previous.endsAt, range.endsAt);
		} else {
			merged.push({ ...range });
		}
	}

	return merged;
}

/** What is left of `ranges` once every busy block is cut out: a commitment always wins over what was reported. */
export function subtract(
	ranges: Array<TimeRange>,
	busy: Array<TimeRange>,
): Array<TimeRange> {
	let remaining = normalize(ranges);

	for (const block of normalize(busy)) {
		const next: Array<TimeRange> = [];

		for (const range of remaining) {
			if (!overlaps(range, block)) {
				next.push(range);
				continue;
			}

			if (range.startsAt < block.startsAt) {
				next.push({ startsAt: range.startsAt, endsAt: block.startsAt });
			}
			if (range.endsAt > block.endsAt) {
				next.push({ startsAt: block.endsAt, endsAt: range.endsAt });
			}
		}

		remaining = next;
	}

	return remaining;
}

/** The parts of the ranges inside `window`, sorted and merged. Keeps one week's view from picking up the next week's windows. */
export function clip(
	ranges: Array<TimeRange>,
	window: TimeRange,
): Array<TimeRange> {
	return normalize(ranges).flatMap((range) => {
		const startsAt = Math.max(range.startsAt, window.startsAt);
		const endsAt = Math.min(range.endsAt, window.endsAt);

		return endsAt > startsAt ? [{ startsAt, endsAt }] : [];
	});
}

/**
 * How one person's schedule relates to an event's window. A busy block overlapping it
 * wins over anything reported (committed elsewhere, schedule known or not). Otherwise the
 * slots cover the window (`available`, ranges as reported), part of it (`partial`, overlap
 * clipped to the window), miss it (`unavailable`) or do not exist (`unknown`).
 */
export function availabilityInWindow({
	reported,
	slots,
	busy,
	window,
}: {
	reported: boolean;
	slots: Array<TimeRange>;
	busy: Array<BusyBlock>;
	window: TimeRange;
}): WindowAvailability {
	const block = busy.find((candidate) => overlaps(candidate, window));
	if (block) return { status: "busy", block };

	if (!reported) return { status: "unknown" };

	const overlapping = normalize(slots).filter((range) =>
		overlaps(range, window),
	);
	if (overlapping.length === 0) return { status: "unavailable" };

	const covers = overlapping.some(
		(range) =>
			range.startsAt <= window.startsAt && range.endsAt >= window.endsAt,
	);

	return covers
		? { status: "available", ranges: overlapping }
		: { status: "partial", ranges: clip(overlapping, window) };
}

/**
 * Spans where `minPlayers` members (`FULL`) or one fewer (`ONE_SHORT`) are free throughout.
 * Windows shorter than `minDurationMinutes` are dropped, as is a `ONE_SHORT` window
 * containing a `FULL` one.
 */
export function playableWindows({
	members,
	minPlayers = AVAILABILITY.DEFAULT_MIN_PLAYERS,
	minDurationMinutes = AVAILABILITY.MIN_WINDOW_MINUTES,
}: {
	members: Array<MemberAvailability>;
	minPlayers?: number;
	minDurationMinutes?: number;
}): Array<PlayableWindow> {
	const segments = availabilitySegments(members);
	const minDuration = minDurationMinutes * MINUTE_IN_SECONDS;

	const full = maximalWindows({ segments, threshold: minPlayers }).filter(
		(window) => window.endsAt - window.startsAt >= minDuration,
	);

	const oneShort =
		minPlayers - 1 > 0
			? maximalWindows({ segments, threshold: minPlayers - 1 }).filter(
					(window) =>
						window.endsAt - window.startsAt >= minDuration &&
						!full.some(
							(fullWindow) =>
								fullWindow.startsAt >= window.startsAt &&
								fullWindow.endsAt <= window.endsAt,
						),
				)
			: [];

	return [
		...full.map((window) => ({ ...window, tier: "FULL" as const })),
		...oneShort.map((window) => ({ ...window, tier: "ONE_SHORT" as const })),
	];
}

/**
 * Splits the members' availability at every start/end into spans, each with the members free
 * throughout. Spans nobody is free in come out with an empty `userIds`.
 */
export function availabilitySegments(members: Array<MemberAvailability>) {
	const normalized = members.map((member) => ({
		userId: member.userId,
		ranges: normalize(member.ranges),
	}));

	const boundaries = R.pipe(
		normalized.flatMap((member) =>
			member.ranges.flatMap((range) => [range.startsAt, range.endsAt]),
		),
		R.unique(),
		R.sortBy((timestamp) => timestamp),
	);

	return boundaries.slice(0, -1).map((startsAt, index) => {
		const endsAt = boundaries[index + 1];

		return {
			startsAt,
			endsAt,
			userIds: normalized
				.filter((member) =>
					member.ranges.some(
						(range) => range.startsAt <= startsAt && range.endsAt >= endsAt,
					),
				)
				.map((member) => member.userId),
		};
	});
}

type AvailabilitySegment = ReturnType<typeof availabilitySegments>[number];

/** Longest windows over which at least `threshold` of the same members are free; windows inside a longer one are skipped. */
function maximalWindows({
	segments,
	threshold,
}: {
	segments: Array<AvailabilitySegment>;
	threshold: number;
}) {
	const windows: Array<TimeRange & { userIds: Array<number> }> = [];

	for (const [index, segment] of segments.entries()) {
		let userIds = segment.userIds;
		if (userIds.length < threshold) continue;

		let end = index;
		while (end + 1 < segments.length) {
			const next = segments[end + 1];
			if (next.startsAt !== segments[end].endsAt) break;

			const shared = userIds.filter((userId) => next.userIds.includes(userId));
			if (shared.length < threshold) break;

			userIds = shared;
			end += 1;
		}

		const endsAt = segments[end].endsAt;
		const previous = windows[windows.length - 1];
		if (previous && previous.endsAt >= endsAt) continue;

		windows.push({ startsAt: segment.startsAt, endsAt, userIds });
	}

	return windows;
}

function inTimezone(timestamp: number, timezone: string) {
	return new TZDate(
		databaseTimestampToJavascriptTimestamp(timestamp),
		timezone,
	);
}
