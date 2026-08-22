import { addWeeks, subWeeks } from "date-fns";
import * as R from "remeda";
import { getViewerTimezone } from "~/features/timezone/timezone-context.server";
import type { SerializeFrom } from "~/utils/remix";
import * as AvailabilityRepository from "../AvailabilityRepository.server";
import { AVAILABILITY } from "../availability-constants";
import type { DayTimeRange, TimeRange } from "../availability-types";
import * as Availability from "./Availability";
import * as Commitments from "./Commitments.server";

const DAY_SECONDS = 24 * 60 * 60;

export type MyScheduleData = SerializeFrom<
	Awaited<ReturnType<typeof myScheduleData>>
>;

/**
 * The user's own reported schedule for the editable weeks (current and next)
 * in their timezone, as the wall-clock representation the schedule editor
 * uses. Also carries the ranges of the week before the current one for the
 * "Copy last week" prefill.
 */
export async function myScheduleData(userId: number) {
	const timezone = getViewerTimezone() ?? "UTC";
	const now = new Date();

	const lastWeekRange = Availability.weekRange(subWeeks(now, 1), timezone);
	const horizonEndsAt = Availability.weekRange(
		addWeeks(now, AVAILABILITY.WEEK_HORIZON - 1),
		timezone,
	).endsAt;
	const [reportedWeeks, busyBlocks] = await Promise.all([
		AvailabilityRepository.findAllWeeksByUserIds({
			userIds: [userId],
			startsAt: lastWeekRange.startsAt,
			endsAt: horizonEndsAt,
		}),
		Commitments.busyBlocksByUserIds({
			userIds: [userId],
			startsAt: Availability.weekRange(now, timezone).startsAt,
			endsAt: horizonEndsAt,
		}),
	]);

	const weeks = R.range(0, AVAILABILITY.WEEK_HORIZON).map((weekOffset) =>
		editorWeek({
			range: Availability.weekRange(addWeeks(now, weekOffset), timezone),
			timezone,
			reportedWeeks,
		}),
	);

	const lastWeek = editorWeek({
		range: lastWeekRange,
		timezone,
		reportedWeeks,
	});

	return {
		weeks,
		lastWeekRanges: lastWeek.submitted
			? lastWeek.days.map((day) => day.ranges)
			: null,
		commitments: (busyBlocks.get(userId) ?? []).map((block) => ({
			date: Availability.dateInTimezone(block.startsAt, timezone),
			range: slotToDayRange(block, timezone),
			type: block.type,
			name: block.name,
		})),
	};
}

type ReportedWeek = Awaited<
	ReturnType<typeof AvailabilityRepository.findAllWeeksByUserIds>
>[number];

function editorWeek({
	range,
	timezone,
	reportedWeeks,
}: {
	range: TimeRange;
	timezone: string;
	reportedWeeks: Array<ReportedWeek>;
}) {
	const matchingWeek = reportedWeeks.find(
		(week) =>
			Math.abs(week.weekStartsAt - range.startsAt) <
			AVAILABILITY.WEEK_MATCH_MAX_DISTANCE_SECONDS,
	);

	const days = R.range(0, 7).map((dayIndex) => {
		const date = Availability.dateInTimezone(
			range.startsAt + dayIndex * DAY_SECONDS + DAY_SECONDS / 2,
			timezone,
		);

		return {
			date,
			ranges: Availability.mergedDayRanges(
				(matchingWeek?.slots ?? [])
					.filter(
						(slot) =>
							Availability.dateInTimezone(slot.startsAt, timezone) === date,
					)
					.map((slot) => slotToDayRange(slot, timezone)),
			),
			note: matchingWeek ? noteOfDay(matchingWeek, date, timezone) : "",
		};
	});

	return {
		weekStartsAt: range.startsAt,
		weekNumber: Availability.isoWeekNumber(
			range.startsAt + DAY_SECONDS / 2,
			timezone,
		),
		submitted: Boolean(matchingWeek),
		days,
	};
}

function slotToDayRange(slot: TimeRange, timezone: string): DayTimeRange {
	const start = Availability.timeToMinutes(
		Availability.timeInTimezone(slot.startsAt, timezone),
	);

	return { start, end: start + Math.round((slot.endsAt - slot.startsAt) / 60) };
}

/** Notes were saved with dates of the week's stored timezone, so they map through that day's noon in case the viewer has since moved. */
function noteOfDay(week: ReportedWeek, date: string, timezone: string) {
	return (
		week.dayNotes.find(
			(note) =>
				Availability.dateInTimezone(
					Availability.localToTimestamp({
						date: note.date,
						time: "12:00",
						timezone: week.timezone,
					}),
					timezone,
				) === date,
		)?.text ?? ""
	);
}
