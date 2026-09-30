import * as R from "remeda";
import type { BusyBlock, TimeRange } from "../availability-types";
import * as Availability from "./Availability";

const DAY_SECONDS = 24 * 60 * 60;

/** One day of a schedule week, as the viewer's timezone places it. */
export interface ScheduleWeekDay {
	/** `YYYY-MM-DD` in the viewer's timezone */
	date: string;
	noonAt: number;
}

/** A week of reported availability, in the shape the repository returns it. */
export interface ReportedWeek {
	userId: number;
	weekStartsAt: number;
	timezone: string;
	slots: Array<TimeRange>;
	dayNotes: Array<{ date: string; text: string }>;
}

/** One member's week as the read-only schedule surfaces render it. */
export interface MemberWeek {
	userId: number;
	/** Whether they filled the week in at all. */
	reported: boolean;
	days: Array<{
		/** Free to play: commitments cut out. What "when can we play" views read. */
		ranges: Array<TimeRange>;
		/** What they filled in, commitments left in place. What views showing the commitments beside it read. */
		reportedRanges: Array<TimeRange>;
		busy: Array<BusyBlock>;
	}>;
	notes: Array<{ dayIndex: number; text: string }>;
}

/** The seven days a week is laid out on in the viewer's timezone, Monday first. */
export function days(
	range: TimeRange,
	timezone: string,
): Array<ScheduleWeekDay> {
	return R.range(0, 7).map((dayIndex) => {
		const noonAt = range.startsAt + dayIndex * DAY_SECONDS + DAY_SECONDS / 2;

		return { date: Availability.dateInTimezone(noonAt, timezone), noonAt };
	});
}

/** The week's ISO number, as its heading names it. */
export function weekNumber(range: TimeRange, timezone: string) {
	return Availability.isoWeekNumber(range.startsAt + DAY_SECONDS / 2, timezone);
}

/**
 * One member's week bucketed into the viewer's days: free time both with commitments cut out and
 * as they reported it, the commitments and their notes. Slots land on the viewer-local day track
 * they start on, wherever the author's week put them, adjacent weeks' spillover included, and what
 * runs past the end of that track continues on the next day.
 */
export function memberRow({
	userId,
	days: weekDays,
	timezone,
	reportedWeeks,
	range,
	busy,
}: {
	userId: number;
	days: Array<ScheduleWeekDay>;
	timezone: string;
	reportedWeeks: Array<ReportedWeek>;
	range: TimeRange;
	busy: Array<BusyBlock>;
}): MemberWeek {
	const busyOfDay = (day: ScheduleWeekDay) =>
		busy.filter(
			(block) =>
				Availability.dateInTimezone(block.startsAt, timezone) === day.date,
		);

	const memberWeeks = reportedWeeks.filter((week) => week.userId === userId);
	const matchingWeek = memberWeeks.find((week) =>
		Availability.isSameWeek(week.weekStartsAt, range.startsAt),
	);

	if (!matchingWeek) {
		return {
			userId,
			reported: false,
			days: weekDays.map((day) => ({
				ranges: [] as Array<TimeRange>,
				reportedRanges: [] as Array<TimeRange>,
				busy: busyOfDay(day),
			})),
			notes: [],
		};
	}

	// stored slots are one row per painted span, so adjacent ones merge before they render
	const reportedSlots = Availability.normalize(
		memberWeeks.flatMap((week) => week.slots),
	);
	const freeTracks = Availability.splitByDayTracks(
		Availability.subtract(reportedSlots, busy),
		timezone,
	);
	const reportedTracks = Availability.splitByDayTracks(reportedSlots, timezone);
	const tracksOfDay = (tracks: Array<TimeRange>, day: ScheduleWeekDay) =>
		tracks.filter(
			(track) =>
				Availability.dateInTimezone(track.startsAt, timezone) === day.date,
		);

	return {
		userId,
		reported: true,
		days: weekDays.map((day) => ({
			ranges: tracksOfDay(freeTracks, day),
			reportedRanges: tracksOfDay(reportedTracks, day),
			busy: busyOfDay(day),
		})),
		notes: memberWeeks.flatMap((week) =>
			week.dayNotes.flatMap((note) => {
				const noteDate = Availability.dateAcrossTimezones({
					date: note.date,
					from: week.timezone,
					to: timezone,
				});
				const dayIndex = weekDays.findIndex((day) => day.date === noteDate);

				return dayIndex === -1 ? [] : [{ dayIndex, text: note.text }];
			}),
		),
	};
}
