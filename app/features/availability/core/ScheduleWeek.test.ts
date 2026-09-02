import { addWeeks } from "date-fns";
import { describe, expect, test } from "vitest";
import * as Availability from "./Availability";
import * as ScheduleWeek from "./ScheduleWeek";

const DAY_SECONDS = 24 * 60 * 60;
const TIMEZONE = "UTC";
const FRIDAY = 4;
const SATURDAY = 5;

describe("ScheduleWeek.memberRow", () => {
	test("shows a member free on Saturday when their Friday night range runs into their Saturday morning range", () => {
		const weekStartsAt = Availability.weekStartsAt(
			addWeeks(new Date(), 1),
			TIMEZONE,
		);
		const range = {
			startsAt: weekStartsAt,
			endsAt: weekStartsAt + 7 * DAY_SECONDS,
		};
		const days = ScheduleWeek.days(range, TIMEZONE);
		const fridayAt = (minutes: number) =>
			Availability.dayMinutesToTimestamp({
				date: days[FRIDAY].date,
				minutes,
				timezone: TIMEZONE,
			});

		// what SAVE_WEEK stores for Fri 20:00-06:00 + Sat 06:00-10:00
		const slots = Availability.normalize([
			{ startsAt: fridayAt(20 * 60), endsAt: fridayAt(30 * 60) },
			{ startsAt: fridayAt(30 * 60), endsAt: fridayAt(34 * 60) },
		]);

		const row = ScheduleWeek.memberRow({
			userId: 1,
			days,
			timezone: TIMEZONE,
			reportedWeeks: [
				{ userId: 1, weekStartsAt, timezone: TIMEZONE, slots, dayNotes: [] },
			],
			range,
			busy: [],
		});

		expect(row.days[SATURDAY].ranges).toEqual([
			{ startsAt: fridayAt(30 * 60), endsAt: fridayAt(34 * 60) },
		]);
	});
});
