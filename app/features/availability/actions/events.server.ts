import { addWeeks } from "date-fns";
import * as R from "remeda";
import { requireUser } from "~/features/auth/core/user.server";
import { resolveNotifications } from "~/features/notifications/core/resolve.server";
import * as TeamRepository from "~/features/team/TeamRepository.server";
import { getViewerTimezone } from "~/features/timezone/timezone-context.server";
import * as UserRepository from "~/features/user-page/UserRepository.server";
import { defineAction } from "~/form/define-action.server";
import { errorToastIfFalsy } from "~/utils/remix.server";
import { assertUnreachable } from "~/utils/types";
import * as AvailabilityRepository from "../AvailabilityRepository.server";
import { AVAILABILITY } from "../availability-constants";
import { eventsActionSchema } from "../availability-schemas";
import * as Availability from "../core/Availability";
import * as DayTrack from "../core/DayTrack";
import * as ScheduleVisibility from "../core/ScheduleVisibility";

const DAY_SECONDS = 24 * 60 * 60;

export const action = defineAction(
	{ body: eventsActionSchema },
	async ({ body }) => {
		const user = requireUser();

		const timezone = getViewerTimezone() ?? "UTC";
		const now = new Date();

		switch (body._action) {
			case "SAVE_WEEK": {
				const weekStartsAt = Availability.localToTimestamp({
					date: body.days[0].date,
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
					body.days.every(
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
						body.days.flatMap((day) =>
							day.ranges.map((range) => ({
								startsAt: DayTrack.dayMinutesToTimestamp({
									date: day.date,
									minutes: range.start,
									timezone,
								}),
								endsAt: DayTrack.dayMinutesToTimestamp({
									date: day.date,
									minutes: range.end,
									timezone,
								}),
							})),
						),
					),
					dayNotes: body.days.flatMap((day) =>
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
			case "SAVE_SCHEDULE_VISIBILITY": {
				const teams = await TeamRepository.findAllMemberOfByUserId(user.id);

				await UserRepository.updateOwnPreferences({
					scheduleVisibility: ScheduleVisibility.fromSelection({
						sharedWith: body.sharedWith,
						teams,
					}),
				});

				break;
			}
			default: {
				assertUnreachable(body);
			}
		}

		return null;
	},
);
