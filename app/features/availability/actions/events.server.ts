import { addWeeks } from "date-fns";
import type { ActionFunction } from "react-router";
import * as R from "remeda";
import { requireUser } from "~/features/auth/core/user.server";
import { resolveNotifications } from "~/features/notifications/core/resolve.server";
import { getViewerTimezone } from "~/features/timezone/timezone-context.server";
import * as UserRepository from "~/features/user-page/UserRepository.server";
import { errorToastIfFalsy, parseRequestPayload } from "~/utils/remix.server";
import { assertUnreachable } from "~/utils/types";
import * as AvailabilityRepository from "../AvailabilityRepository.server";
import { AVAILABILITY } from "../availability-constants";
import { eventsActionSchema } from "../availability-schemas";
import * as Availability from "../core/Availability";

const DAY_SECONDS = 24 * 60 * 60;

export const action: ActionFunction = async ({ request }) => {
	const user = requireUser();

	const data = await parseRequestPayload({
		request,
		schema: eventsActionSchema,
	});
	const timezone = getViewerTimezone() ?? "UTC";
	const now = new Date();

	switch (data._action) {
		case "SAVE_WEEK": {
			const weekStartsAt = Availability.localToTimestamp({
				date: data.days[0].date,
				time: "00:00",
				timezone,
			});

			errorToastIfFalsy(
				R.range(0, AVAILABILITY.WEEK_HORIZON).some(
					(weekOffset) =>
						Availability.weekStartsAt(addWeeks(now, weekOffset), timezone) ===
						weekStartsAt,
				),
				"Only the current and the next week can be saved",
			);
			errorToastIfFalsy(
				data.days.every(
					(day, dayIndex) =>
						day.date ===
						Availability.dateInTimezone(
							weekStartsAt + dayIndex * DAY_SECONDS + DAY_SECONDS / 2,
							timezone,
						),
				),
				"Days do not form one week",
			);

			await AvailabilityRepository.upsertOwnWeek({
				weekStartsAt,
				timezone,
				// normalized so ranges overlapping across midnight land as one slot
				slots: Availability.normalize(
					data.days.flatMap((day) =>
						day.ranges.map((range) => ({
							startsAt: Availability.dayMinutesToTimestamp({
								date: day.date,
								minutes: range.start,
								timezone,
							}),
							endsAt: Availability.dayMinutesToTimestamp({
								date: day.date,
								minutes: range.end,
								timezone,
							}),
						})),
					),
				),
				dayNotes: data.days.flatMap((day) =>
					day.note ? [{ date: day.date, text: day.note }] : [],
				),
			});

			await resolveNotifications({
				userIds: [user.id],
				type: "SCHEDULE_TEAM_REMINDER",
			});

			break;
		}
		case "DISMISS_SCHEDULE_NUDGE": {
			await UserRepository.updateOwnPreferences({
				scheduleNudgeDismissedWeekStartsAt: Availability.weekStartsAt(
					addWeeks(now, 1),
					timezone,
				),
			});

			break;
		}
		default: {
			assertUnreachable(data);
		}
	}

	return null;
};
