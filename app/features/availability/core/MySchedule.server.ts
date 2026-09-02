import { addWeeks, subWeeks } from "date-fns";
import * as R from "remeda";
import { getViewerTimezone } from "~/features/timezone/timezone-context.server";
import type { SerializeFrom } from "~/utils/remix";
import * as AvailabilityRepository from "../AvailabilityRepository.server";
import { AVAILABILITY } from "../availability-constants";
import type { DayTimeRange, TimeRange } from "../availability-types";
import * as Availability from "./Availability";
import * as Commitments from "./Commitments.server";
import * as ScheduleWeek from "./ScheduleWeek";

export type MyScheduleData = SerializeFrom<
	Awaited<ReturnType<typeof myScheduleData>>
>;

/**
 * The user's reported current and next week in their timezone as the editor's wall-clock
 * representation, plus the week before for the "Copy last week" prefill.
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
	const matchingWeek = reportedWeeks.find((week) =>
		Availability.isSameWeek(week.weekStartsAt, range.startsAt),
	);

	const slots = Availability.splitByDayTracks(
		matchingWeek?.slots ?? [],
		timezone,
	);

	const days = ScheduleWeek.days(range, timezone).map(({ date }) => ({
		date,
		ranges: Availability.mergedDayRanges(
			slots
				.filter(
					(slot) =>
						Availability.dateInTimezone(slot.startsAt, timezone) === date,
				)
				.map((slot) => slotToDayRange(slot, timezone)),
		),
		note: matchingWeek ? noteOfDay(matchingWeek, date, timezone) : "",
	}));

	return {
		weekStartsAt: range.startsAt,
		weekNumber: ScheduleWeek.weekNumber(range, timezone),
		submitted: Boolean(matchingWeek),
		days,
	};
}

function slotToDayRange(slot: TimeRange, timezone: string): DayTimeRange {
	const date = Availability.dateInTimezone(slot.startsAt, timezone);

	return {
		start: Availability.timestampToDayMinutes({
			date,
			timestamp: slot.startsAt,
			timezone,
		}),
		end: Availability.timestampToDayMinutes({
			date,
			timestamp: slot.endsAt,
			timezone,
		}),
	};
}

function noteOfDay(week: ReportedWeek, date: string, timezone: string) {
	return (
		week.dayNotes.find(
			(note) =>
				Availability.dateAcrossTimezones({
					date: note.date,
					from: week.timezone,
					to: timezone,
				}) === date,
		)?.text ?? ""
	);
}
