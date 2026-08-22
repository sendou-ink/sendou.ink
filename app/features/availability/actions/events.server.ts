import { addWeeks } from "date-fns";
import type { ActionFunction } from "react-router";
import * as R from "remeda";
import { requireUser } from "~/features/auth/core/user.server";
import { getViewerTimezone } from "~/features/timezone/timezone-context.server";
import { errorToastIfFalsy, parseRequestPayload } from "~/utils/remix.server";
import * as AvailabilityRepository from "../AvailabilityRepository.server";
import { AVAILABILITY } from "../availability-constants";
import { saveWeekSchema } from "../availability-schemas";
import * as Availability from "../core/Availability";

const DAY_SECONDS = 24 * 60 * 60;

export const action: ActionFunction = async ({ request }) => {
	requireUser();

	const data = await parseRequestPayload({ request, schema: saveWeekSchema });
	const timezone = getViewerTimezone() ?? "UTC";

	const weekStartsAt = Availability.localToTimestamp({
		date: data.days[0].date,
		time: "00:00",
		timezone,
	});

	const now = new Date();
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
		slots: data.days.flatMap((day) =>
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
		dayNotes: data.days.flatMap((day) =>
			day.note ? [{ date: day.date, text: day.note }] : [],
		),
	});

	return null;
};
