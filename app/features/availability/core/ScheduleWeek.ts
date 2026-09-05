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
	days: Array<{ ranges: Array<TimeRange>; busy: Array<BusyBlock> }>;
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
 * One member's week bucketed into the viewer's days: effective free time (commitments cut out
 * first), the commitments and their notes. Slots land on the viewer-local day track they start
 * on, wherever the author's week put them, adjacent weeks' spillover included, and what runs past
 * the end of that track continues on the next day.
 */
export function memberRow({
	userId,
	days,
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
			days: days.map((day) => ({
				ranges: [] as Array<TimeRange>,
				busy: busyOfDay(day),
			})),
			notes: [],
		};
	}

	const slots = Availability.splitByDayTracks(
		Availability.subtract(
			memberWeeks.flatMap((week) => week.slots),
			busy,
		),
		timezone,
	);

	return {
		userId,
		reported: true,
		days: days.map((day) => ({
			ranges: slots.filter(
				(slot) =>
					Availability.dateInTimezone(slot.startsAt, timezone) === day.date,
			),
			busy: busyOfDay(day),
		})),
		notes: memberWeeks.flatMap((week) =>
			week.dayNotes.flatMap((note) => {
				const noteDate = Availability.dateAcrossTimezones({
					date: note.date,
					from: week.timezone,
					to: timezone,
				});
				const dayIndex = days.findIndex((day) => day.date === noteDate);

				return dayIndex === -1 ? [] : [{ dayIndex, text: note.text }];
			}),
		),
	};
}
