import { addWeeks } from "date-fns";
import * as R from "remeda";
import { dateToDatabaseTimestamp } from "~/utils/dates";
import type { SerializeFrom } from "~/utils/remix";
import * as AvailabilityRepository from "../AvailabilityRepository.server";
import { AVAILABILITY } from "../availability-constants";
import type { TimeRange } from "../availability-types";
import * as Availability from "./Availability";
import * as Commitments from "./Commitments.server";

const DAY_SECONDS = 24 * 60 * 60;

export type RosterScheduleData = SerializeFrom<
	Awaited<ReturnType<typeof rosterScheduleData>>
>;

/**
 * Effective availability of the given users over the reportable horizon, laid
 * out as the viewer-local weeks and days the schedule surfaces render on.
 *
 * Which of these users make up a roster is only known in the browser (the
 * scrim post form's team select, its pick-up member search), so the roster's
 * shared free time is not resolved here — the members come out one by one and
 * {@link Availability.playableWindows} merges the picked ones client side.
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
						memberWeeks.some(
							(memberWeek) =>
								Math.abs(memberWeek.weekStartsAt - week.startsAt) <
								AVAILABILITY.WEEK_MATCH_MAX_DISTANCE_SECONDS,
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
	const dayStartsAt = (dayIndex: number) =>
		dayIndex === 7
			? range.endsAt
			: Availability.localToTimestamp({
					date: Availability.dateInTimezone(
						range.startsAt + dayIndex * DAY_SECONDS + DAY_SECONDS / 2,
						timezone,
					),
					time: "00:00",
					timezone,
				});

	return {
		startsAt: range.startsAt,
		endsAt: range.endsAt,
		weekNumber: Availability.isoWeekNumber(
			range.startsAt + DAY_SECONDS / 2,
			timezone,
		),
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
