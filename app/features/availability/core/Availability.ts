import { TZDate } from "@date-fns/tz";
import { addWeeks, format, startOfWeek } from "date-fns";
import * as R from "remeda";
import {
	databaseTimestampToJavascriptTimestamp,
	dateToDatabaseTimestamp,
} from "~/utils/dates";
import invariant from "~/utils/invariant";
import { AVAILABILITY } from "../availability-constants";
import type {
	DayTimeRange,
	MemberAvailability,
	PlayableWindow,
	TimeRange,
} from "../availability-types";

const MINUTE_IN_SECONDS = 60;

/**
 * Database timestamp of the Monday 00:00 that starts the week `date` falls in,
 * as the week is seen in `timezone`.
 */
export function weekStartsAt(date: Date, timezone: string) {
	const zoned = new TZDate(date.getTime(), timezone);

	return dateToDatabaseTimestamp(startOfWeek(zoned, { weekStartsOn: 1 }));
}

/**
 * The week `date` falls in as a time range, `endsAt` being the Monday 00:00 that
 * starts the next week. Not always 7×24h long: a week with a DST transition in
 * it is an hour shorter or longer.
 */
export function weekRange(date: Date, timezone: string): TimeRange {
	const zoned = new TZDate(date.getTime(), timezone);
	const start = startOfWeek(zoned, { weekStartsOn: 1 });

	return {
		startsAt: dateToDatabaseTimestamp(start),
		endsAt: dateToDatabaseTimestamp(addWeeks(start, 1)),
	};
}

/**
 * Database timestamp of the given wall clock time in `timezone`. `date` is
 * `YYYY-MM-DD` and `time` is `HH:mm`, the shapes the availability tables and
 * form fields use.
 */
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
 * `YYYY-MM-DD` of the timestamp in `timezone`. What day a slot belongs to
 * depends on who is looking at it, so the day of a slot is always resolved from
 * its timestamp rather than from the day its author entered it on.
 */
export function dateInTimezone(timestamp: number, timezone: string) {
	return format(inTimezone(timestamp, timezone), "yyyy-MM-dd");
}

/** `HH:mm` of the timestamp in `timezone`. */
export function timeInTimezone(timestamp: number, timezone: string) {
	return format(inTimezone(timestamp, timezone), "HH:mm");
}

/** Whether the two ranges share any time at all. Ranges that merely touch do not overlap. */
export function overlaps(one: TimeRange, other: TimeRange) {
	return one.startsAt < other.endsAt && other.startsAt < one.endsAt;
}

/**
 * The given ranges sorted and merged, so that no two of them overlap or touch.
 * Empty ranges are dropped.
 */
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

/**
 * Effective availability: what is left of `ranges` once every busy block is cut
 * out of them. A commitment always wins over what the user reported.
 */
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

/**
 * The windows the team could play in: spans
 * where `minPlayers` of the members (`FULL`) or one fewer (`ONE_SHORT`) are all
 * free from the first minute of the window to the last. Windows shorter than
 * `minDurationMinutes` are left out, as is any `ONE_SHORT` window that already
 * contains a `FULL` one.
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

/** Rounds minutes counted from the start of a day track to the nearest step. */
export function snapMinutes(
	minutes: number,
	step: number = AVAILABILITY.SLOT_STEP_MINUTES,
) {
	return Math.round(minutes / step) * step;
}

/**
 * Splits the members' availability into the spans between every start and end
 * of it, each with the members free for the whole span.
 */
function availabilitySegments(members: Array<MemberAvailability>) {
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

/**
 * The longest possible windows over which at least `threshold` of the same
 * members are free throughout. A window is only reported when no longer window
 * contains it.
 */
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

/** Minutes from midnight of a `HH:mm` time string. */
export function timeToMinutes(time: string) {
	const [hours, minutes] = time.split(":").map(Number);

	invariant(
		Number.isFinite(hours) && Number.isFinite(minutes),
		`Malformed time: ${time}`,
	);

	return hours * 60 + minutes;
}

/**
 * `HH:mm` on the clock at the given minutes from midnight. Minutes past 24h
 * wrap around, so the end of a range crossing midnight prints as e.g. `02:00`.
 */
export function minutesToTime(minutes: number) {
	const onClock = ((minutes % DAY_MINUTES) + DAY_MINUTES) % DAY_MINUTES;

	return `${String(Math.floor(onClock / 60)).padStart(2, "0")}:${String(
		onClock % 60,
	).padStart(2, "0")}`;
}

/**
 * Editor day range of the given start and end times. An end earlier than the
 * start means the range crosses midnight; an end equal to the start is an
 * empty range (dropped by {@link mergedDayRanges}).
 */
export function dayRangeFromTimes(start: string, end: string): DayTimeRange {
	const startMinutes = timeToMinutes(start);
	const endMinutes = timeToMinutes(end);

	return {
		start: startMinutes,
		end: endMinutes >= startMinutes ? endMinutes : endMinutes + DAY_MINUTES,
	};
}

/**
 * The ranges of one day track sorted and merged so that no two of them overlap
 * or touch. Empty ranges are dropped.
 */
export function mergedDayRanges(
	ranges: Array<DayTimeRange>,
): Array<DayTimeRange> {
	return normalize(ranges.map(toTimeRange)).map(toDayRange);
}

interface TrackWindowArgs {
	/** Left edge of the visible clock window, minutes from midnight. */
	trackStart: number;
	/** Right edge of the visible clock window, minutes from midnight. */
	trackEnd: number;
}

/**
 * Range painted by dragging on an empty part of a day track from `anchor` to
 * `cursor` (both minutes from midnight): ends snapped to the entry step, at
 * least one step long and kept inside the track. Painting cannot start on a
 * wall (a commitment) but may extend across one — null when the anchor is
 * inside a wall.
 */
export function paintedRange({
	anchor,
	cursor,
	walls,
	trackStart,
	trackEnd,
}: TrackWindowArgs & {
	anchor: number;
	cursor: number;
	/** Blocks a paint cannot start on, i.e. the day's commitments. */
	walls: Array<DayTimeRange>;
}): DayTimeRange | null {
	if (insideWall(anchor, walls)) return null;

	const track = { start: trackStart, end: trackEnd };
	const from = clampMinutes(snapMinutes(anchor), track);
	const to = clampMinutes(snapMinutes(cursor), track);

	let start = Math.min(from, to);
	let end = Math.max(from, to);

	if (end - start < AVAILABILITY.SLOT_STEP_MINUTES) {
		end = Math.min(start + AVAILABILITY.SLOT_STEP_MINUTES, trackEnd);
		start = end - AVAILABILITY.SLOT_STEP_MINUTES;
	}

	return { start, end };
}

/**
 * `range` moved by `delta` minutes: the move is snapped to the entry step and
 * stopped at the track edges.
 */
export function movedRange({
	range,
	delta,
	trackStart,
	trackEnd,
}: TrackWindowArgs & {
	range: DayTimeRange;
	delta: number;
}): DayTimeRange {
	const length = range.end - range.start;
	if (trackEnd - trackStart < length) return range;

	const start = R.clamp(range.start + snapMinutes(delta), {
		min: trackStart,
		max: trackEnd - length,
	});

	return { start, end: start + length };
}

/**
 * `range` with one edge dragged to `cursor`: snapped to the entry step, kept
 * at least one step long and stopped at the track edges.
 */
export function resizedRange({
	range,
	edge,
	cursor,
	trackStart,
	trackEnd,
}: TrackWindowArgs & {
	range: DayTimeRange;
	edge: "start" | "end";
	cursor: number;
}): DayTimeRange {
	if (edge === "start") {
		const start = R.clamp(snapMinutes(cursor), {
			min: trackStart,
			max: range.end - AVAILABILITY.SLOT_STEP_MINUTES,
		});

		return { start, end: range.end };
	}

	const end = R.clamp(snapMinutes(cursor), {
		min: range.start + AVAILABILITY.SLOT_STEP_MINUTES,
		max: trackEnd,
	});

	return { start: range.start, end };
}

const DAY_MINUTES = 24 * 60;

const toTimeRange = (range: DayTimeRange): TimeRange => ({
	startsAt: range.start,
	endsAt: range.end,
});

const toDayRange = (range: TimeRange): DayTimeRange => ({
	start: range.startsAt,
	end: range.endsAt,
});

const clampMinutes = (minutes: number, range: DayTimeRange) =>
	R.clamp(minutes, { min: range.start, max: range.end });

const insideWall = (point: number, walls: Array<DayTimeRange>) =>
	mergedDayRanges(walls).some(
		(wall) => wall.start <= point && point < wall.end,
	);
