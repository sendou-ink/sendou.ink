import { addWeeks } from "date-fns";
import * as R from "remeda";
import * as AvailabilityRepository from "../AvailabilityRepository.server";
import { AVAILABILITY } from "../availability-constants";
import type { ScheduleWeekView } from "../availability-types";
import * as Availability from "./Availability";
import * as Commitments from "./Commitments.server";
import * as ScheduleWeek from "./ScheduleWeek";

/**
 * The reportable weeks of the given users as the friends page's week modal
 * shows them, keyed by user id: nothing but the time they are free to play,
 * commitments already subtracted. Users who reported neither week are left out,
 * so a missing key is what "no schedule to show" means — and the friends page
 * both sorts and shows its calendar icon by that.
 *
 * Everyone asked about is a friend or a teammate of the viewer, which is what
 * makes their schedule theirs to see; the caller owns that guarantee.
 */
export async function findByUserIds({
	userIds,
	timezone,
}: {
	userIds: Array<number>;
	timezone: string;
}): Promise<Map<number, Array<ScheduleWeekView>>> {
	const now = new Date();

	const ranges = R.range(0, AVAILABILITY.WEEK_HORIZON).map((weekOffset) =>
		Availability.weekRange(addWeeks(now, weekOffset), timezone),
	);
	const horizon = {
		startsAt: ranges[0].startsAt,
		endsAt: ranges[ranges.length - 1].endsAt,
	};

	const [reportedWeeks, busyByUserId] = await Promise.all([
		AvailabilityRepository.findAllWeeksByUserIds({ userIds, ...horizon }),
		Commitments.busyBlocksByUserIds({ userIds, ...horizon }),
	]);

	const weeks = ranges.map((range, index) => ({
		range,
		week: index === 0 ? ("current" as const) : ("next" as const),
		weekNumber: ScheduleWeek.weekNumber(range, timezone),
		days: ScheduleWeek.days(range, timezone),
	}));

	return new Map(
		userIds.flatMap((userId) => {
			const busy = busyByUserId.get(userId) ?? [];

			const views = weeks.map((week): ScheduleWeekView => {
				const row = ScheduleWeek.memberRow({
					userId,
					days: week.days,
					timezone,
					reportedWeeks,
					range: week.range,
					busy,
				});

				return {
					week: week.week,
					weekNumber: week.weekNumber,
					reported: row.reported,
					days: week.days.map((day, dayIndex) => ({
						noonAt: day.noonAt,
						ranges: row.days[dayIndex].ranges,
					})),
				};
			});

			return views.some((view) => view.reported) ? [[userId, views]] : [];
		}),
	);
}
