import { addWeeks } from "date-fns";
import * as R from "remeda";
import {
	databaseTimestampToDate,
	dateToDatabaseTimestamp,
} from "~/utils/dates";
import type { SerializeFrom } from "~/utils/remix";
import * as AvailabilityRepository from "../AvailabilityRepository.server";
import { AVAILABILITY } from "../availability-constants";
import type { TimeRange, WindowSchedule } from "../availability-types";
import * as Availability from "./Availability";
import * as Commitments from "./Commitments.server";
import * as ScheduleWeek from "./ScheduleWeek";

const DAY_SECONDS = 24 * 60 * 60;

export type RosterScheduleData = SerializeFrom<
	Awaited<ReturnType<typeof rosterScheduleData>>
>;

/**
 * Effective availability of the users over the reportable horizon as viewer-local weeks and
 * days. Which users form a roster is only known in the browser (scrim post form's team select,
 * pick-up search), so members come out one by one and {@link Availability.playableWindows}
 * merges the picked ones client side.
 */
export async function rosterScheduleData({
	userIds,
	timezone,
}: {
	userIds: Array<number>;
	timezone: string;
}) {
	const now = new Date();
	const horizon = {
		startsAt: Availability.weekRange(now, timezone).startsAt,
		endsAt: Availability.weekRange(
			addWeeks(now, AVAILABILITY.WEEK_HORIZON - 1),
			timezone,
		).endsAt,
	};

	const [reportedWeeks, busyByUserId] = await Promise.all([
		AvailabilityRepository.findAllWeeksByUserIds({ userIds, ...horizon }),
		Commitments.busyBlocksByUserIds({ userIds, ...horizon }),
	]);

	const weeks = R.range(0, AVAILABILITY.WEEK_HORIZON).map((weekOffset) =>
		weekView({
			range: Availability.weekRange(addWeeks(now, weekOffset), timezone),
			timezone,
		}),
	);

	return {
		/** Server clock, so that the picker's cutoff of past windows renders the same before and after hydration. */
		now: dateToDatabaseTimestamp(now),
		weeks,
		members: userIds.map((userId) => {
			const memberWeeks = reportedWeeks.filter(
				(week) => week.userId === userId,
			);
			const busy = busyByUserId.get(userId) ?? [];

			return {
				userId,
				reportedWeekStarts: weeks
					.filter((week) =>
						memberWeeks.some((memberWeek) =>
							Availability.isSameWeek(memberWeek.weekStartsAt, week.startsAt),
						),
					)
					.map((week) => week.startsAt),
				ranges: Availability.subtract(
					Availability.clip(
						memberWeeks.flatMap((week) => week.slots),
						horizon,
					),
					busy,
				),
			};
		}),
	};
}

function weekView({ range, timezone }: { range: TimeRange; timezone: string }) {
	const dates = ScheduleWeek.days(range, timezone);
	const dayStartsAt = (dayIndex: number) =>
		dayIndex === 7
			? range.endsAt
			: Availability.localToTimestamp({
					date: dates[dayIndex].date,
					time: "00:00",
					timezone,
				});

	return {
		startsAt: range.startsAt,
		endsAt: range.endsAt,
		weekNumber: ScheduleWeek.weekNumber(range, timezone),
		days: R.range(0, 7).map((dayIndex) => {
			const startsAt = dayStartsAt(dayIndex);

			return {
				startsAt,
				endsAt: dayStartsAt(dayIndex + 1),
				noonAt: startsAt + DAY_SECONDS / 2,
			};
		}),
	};
}

/**
 * What the users' schedules say about each window: reported ranges inside it, overriding
 * commitments and whether the week was filled in at all. Resolved in one go so a page with many
 * windows (scrim fit indicators) reads the schedules once. Windows past the horizon are left out.
 */
export async function windowSchedules({
	windows,
	userIds,
}: {
	windows: Array<TimeRange & { id: number }>;
	userIds: Array<number>;
}) {
	// the horizon's last week starts at the current week's start at the latest, so nothing inside it reaches this far
	const horizonEndsAt = dateToDatabaseTimestamp(
		addWeeks(new Date(), AVAILABILITY.WEEK_HORIZON),
	);
	const withinHorizon = windows.filter(
		(window) => window.startsAt < horizonEndsAt,
	);

	if (withinHorizon.length === 0 || userIds.length === 0) return [];

	const range = {
		startsAt: Math.min(...withinHorizon.map((window) => window.startsAt)),
		endsAt: Math.max(...withinHorizon.map((window) => window.endsAt)),
	};

	const [reportedWeeks, busyByUserId] = await Promise.all([
		AvailabilityRepository.findAllWeeksByUserIds({ userIds, ...range }),
		Commitments.busyBlocksByUserIds({ userIds, ...range }),
	]);

	return withinHorizon.map((window) => ({
		id: window.id,
		members: userIds.map((userId): WindowSchedule => {
			const memberWeeks = reportedWeeks.filter(
				(week) => week.userId === userId,
			);
			const busy = (busyByUserId.get(userId) ?? []).filter((block) =>
				Availability.overlaps(block, window),
			);

			return {
				userId,
				// which week a window falls in goes by the member's own clock, the one they filled the week in on
				reported: memberWeeks.some(
					(week) =>
						Availability.weekStartsAt(
							databaseTimestampToDate(window.startsAt),
							week.timezone,
						) === week.weekStartsAt,
				),
				ranges: Availability.clip(
					Availability.subtract(
						memberWeeks.flatMap((week) => week.slots),
						busy,
					),
					window,
				),
				busy,
			};
		}),
	}));
}
