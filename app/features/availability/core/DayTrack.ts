/**
 * The day tracks schedules render on: a day's ranges as minutes from its midnight
 * (`DayTimeRange`) and how they convert to and from timestamps, plus the ranges the editor's
 * painting, moving and resizing produce. A track runs past midnight, a range belonging to the day
 * it starts on.
 */
import { TZDate } from "@date-fns/tz";
import { differenceInCalendarDays, parseISO } from "date-fns";
import * as R from "remeda";
import { dateToDatabaseTimestamp } from "~/utils/dates";
import { invariant } from "~/utils/invariant";
import { AVAILABILITY } from "../availability-constants";
import type { DayTimeRange, TimeRange } from "../availability-types";
import * as Availability from "./Availability";

const DAY_MINUTES = 24 * 60;

/**
 * Database timestamp of `minutes` from midnight of `date` in `timezone`. Minutes past
 * 1440 roll into the next day; on a DST day the clock rolls through the change like a
 * hand-entered time would.
 */
export function dayMinutesToTimestamp({
	date,
	minutes,
	timezone,
}: {
	date: string;
	minutes: number;
	timezone: string;
}) {
	const [year, month, day] = date.split("-").map(Number);

	invariant(
		[year, month, day, minutes].every((part) => Number.isFinite(part)),
		`Malformed local time: ${date} +${minutes}min`,
	);

	return dateToDatabaseTimestamp(
		new TZDate(year, month - 1, day, 0, minutes, 0, timezone),
	);
}

/**
 * Minutes from midnight of `date` in `timezone`, the inverse of {@link dayMinutesToTimestamp}.
 * A timestamp on a later day counts on past 1440, read off the wall clock so a DST change inside
 * the range does not stretch or shrink it.
 */
export function timestampToDayMinutes({
	date,
	timestamp,
	timezone,
}: {
	date: string;
	timestamp: number;
	timezone: string;
}) {
	const dayDifference = differenceInCalendarDays(
		parseISO(Availability.dateInTimezone(timestamp, timezone)),
		parseISO(date),
	);

	return (
		dayDifference * DAY_MINUTES +
		timeToMinutes(Availability.timeInTimezone(timestamp, timezone))
	);
}

/** The ranges cut up into the day tracks they render on, what runs past a track's end continuing on the next day's. */
export function splitByDayTracks(
	ranges: Array<TimeRange>,
	timezone: string,
): Array<TimeRange> {
	return ranges.flatMap((range) => {
		const tracks: Array<TimeRange> = [];

		let startsAt = range.startsAt;
		while (startsAt < range.endsAt) {
			const trackEndsAt = dayMinutesToTimestamp({
				date: Availability.dateInTimezone(startsAt, timezone),
				minutes: AVAILABILITY.TRACK_LATER_END_MINUTES,
				timezone,
			});
			const endsAt = Math.min(range.endsAt, trackEndsAt);
			if (endsAt <= startsAt) break;

			tracks.push({ startsAt, endsAt });
			startsAt = endsAt;
		}

		return tracks;
	});
}

/**
 * Rounds minutes counted from the start of a day track to the nearest step.
 * @internal
 */
export function snapMinutes(
	minutes: number,
	step: number = AVAILABILITY.SLOT_STEP_MINUTES,
) {
	return Math.round(minutes / step) * step;
}

/**
 * Minutes from midnight of a `HH:mm` time string.
 * @internal
 */
export function timeToMinutes(time: string) {
	const [hours, minutes] = time.split(":").map(Number);

	invariant(
		Number.isFinite(hours) && Number.isFinite(minutes),
		`Malformed time: ${time}`,
	);

	return hours * 60 + minutes;
}

/** `HH:mm` at the given minutes from midnight; minutes past 24h wrap, so a range crossing midnight ends at e.g. `02:00`. */
export function minutesToTime(minutes: number) {
	const onClock = ((minutes % DAY_MINUTES) + DAY_MINUTES) % DAY_MINUTES;

	return `${String(Math.floor(onClock / 60)).padStart(2, "0")}:${String(
		onClock % 60,
	).padStart(2, "0")}`;
}

/**
 * Editor day range of the given times. An end before the start crosses midnight;
 * an end equal to the start is an empty range (dropped by {@link mergedDayRanges}).
 */
export function dayRangeFromTimes(start: string, end: string): DayTimeRange {
	const startMinutes = timeToMinutes(start);
	const endMinutes = timeToMinutes(end);

	return {
		start: startMinutes,
		end: endMinutes >= startMinutes ? endMinutes : endMinutes + DAY_MINUTES,
	};
}

/** One day track's ranges sorted and merged so that no two overlap or touch. Empty ranges are dropped. */
export function mergedDayRanges(
	ranges: Array<DayTimeRange>,
): Array<DayTimeRange> {
	return Availability.normalize(ranges.map(toTimeRange)).map(toDayRange);
}

interface TrackWindowArgs {
	/** Left edge of the visible clock window, minutes from midnight. */
	trackStart: number;
	/** Right edge of the visible clock window, minutes from midnight. */
	trackEnd: number;
}

/**
 * Last step before midnight. A range belongs to the day it starts on, so a start past
 * midnight would silently be another day's range — the post-midnight zone only extends ends.
 */
const MAX_RANGE_START = DAY_MINUTES - AVAILABILITY.SLOT_STEP_MINUTES;

/**
 * Range painted by dragging an empty part of a day track from `anchor` to `cursor` (minutes
 * from midnight): snapped to the entry step, at least one step long, inside the track, start
 * kept before midnight (a paint anchored past it grows leftwards from the day's last step).
 * Null when the anchor is inside a wall (a commitment); a paint may still extend across one.
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

	if (start > MAX_RANGE_START) {
		start = MAX_RANGE_START;
		end = Math.max(end, start + AVAILABILITY.SLOT_STEP_MINUTES);
	}

	return { start, end };
}

/** `range` moved by `delta` minutes, snapped to the entry step, stopped at the track edges, start kept before midnight. */
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
		max: Math.min(trackEnd - length, MAX_RANGE_START),
	});

	return { start, end: start + length };
}

/** `range` with one edge dragged to `cursor`: snapped, at least one step long, inside the track, start kept before midnight. */
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
			max: Math.min(
				range.end - AVAILABILITY.SLOT_STEP_MINUTES,
				MAX_RANGE_START,
			),
		});

		return { start, end: range.end };
	}

	const end = R.clamp(snapMinutes(cursor), {
		min: range.start + AVAILABILITY.SLOT_STEP_MINUTES,
		max: trackEnd,
	});

	return { start: range.start, end };
}

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
