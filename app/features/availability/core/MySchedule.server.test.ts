import * as R from "remeda";
import * as v from "valibot";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import * as UserFactory from "~/db/seed/factories/UserFactory";
import { viewerTimezoneAsyncLocalStorage } from "~/features/timezone/timezone-context.server";
import { wrappedAction } from "~/utils/Test";
import { action as eventsAction } from "../actions/events.server";
import { saveWeekSchema } from "../availability-schemas";
import * as Availability from "./Availability";
import { myScheduleData } from "./MySchedule.server";

const DAY_SECONDS = 24 * 60 * 60;
const TIMEZONE = "UTC";

const saveWeek = wrappedAction<typeof saveWeekSchema>({
	action: eventsAction,
	isJsonSubmission: true,
});

const weekDays = () => {
	return daysOfWeekStarting(
		Availability.weekStartsAt(new Date(), TIMEZONE, 1),
		TIMEZONE,
	);
};

// editor with both expanders open: 06:00 -> 06:00 the next day
const WHOLE_TRACK = { start: 6 * 60, end: 30 * 60 };
const FRIDAY = 4;
const SATURDAY = 5;

const HELSINKI = "Europe/Helsinki";
// Tuesday of the week whose Saturday night has the fall-back transition (Sun 2026-10-25 04:00 -> 03:00)
const NOW = new Date("2026-10-20T12:00:00Z");
const SATURDAY_NIGHT = { start: 22 * 60, end: 28 * 60 };

const inViewerTimezone = <T>(fn: () => Promise<T>) =>
	viewerTimezoneAsyncLocalStorage.run({ timezone: HELSINKI }, fn);

const currentWeekDays = () =>
	daysOfWeekStarting(Availability.weekStartsAt(NOW, HELSINKI), HELSINKI);

const NEW_YORK = "America/New_York";

const inNewYork = <T>(fn: () => Promise<T>) =>
	viewerTimezoneAsyncLocalStorage.run({ timezone: NEW_YORK }, fn);

describe("myScheduleData", () => {
	test("reads back a day painted right after another day's range that reaches into it", async () => {
		const user = await UserFactory.createRegular();
		const days = weekDays();
		days[FRIDAY].ranges = [{ start: 20 * 60, end: 30 * 60 }];
		days[SATURDAY].ranges = [{ start: 6 * 60, end: 10 * 60 }];

		const response = await saveWeek(
			{ _action: "SAVE_WEEK", days },
			{ user: "regular" },
		);
		expect(response).toBeNull();

		const data = await myScheduleData(user.id);
		const nextWeek = data.weeks[1];

		expect(nextWeek.days[FRIDAY].ranges).toEqual([
			{ start: 20 * 60, end: 30 * 60 },
		]);
		expect(nextWeek.days[SATURDAY].ranges).toEqual([
			{ start: 6 * 60, end: 10 * 60 },
		]);
	});

	test("reads back a weekend painted as whole tracks", async () => {
		const user = await UserFactory.createRegular();
		const days = weekDays();
		days[FRIDAY].ranges = [WHOLE_TRACK];
		days[SATURDAY].ranges = [WHOLE_TRACK];

		const response = await saveWeek(
			{ _action: "SAVE_WEEK", days },
			{ user: "regular" },
		);
		expect(response).toBeNull();

		const data = await myScheduleData(user.id);
		const nextWeek = data.weeks[1];

		expect(nextWeek.days[SATURDAY].ranges).toEqual([WHOLE_TRACK]);
	});

	test("reads a weekend painted as whole tracks back in a shape that can be saved again", async () => {
		const user = await UserFactory.createRegular();
		const days = weekDays();
		days[FRIDAY].ranges = [WHOLE_TRACK];
		days[SATURDAY].ranges = [WHOLE_TRACK];

		await saveWeek({ _action: "SAVE_WEEK", days }, { user: "regular" });

		const data = await myScheduleData(user.id);
		const nextWeek = data.weeks[1];

		const resubmission = v.safeParse(saveWeekSchema, {
			_action: "SAVE_WEEK",
			days: nextWeek.days,
		});
		expect(resubmission.success).toBe(true);
	});

	describe("across the DST fall-back night", () => {
		beforeEach(() => {
			vi.useFakeTimers({ toFake: ["Date"] });
			vi.setSystemTime(NOW);
		});
		afterEach(() => {
			vi.useRealTimers();
		});

		test("reads Saturday 22:00-04:00 back as painted", async () => {
			const user = await UserFactory.createRegular();
			const days = currentWeekDays();
			days[SATURDAY].ranges = [SATURDAY_NIGHT];

			const response = await inViewerTimezone(() =>
				saveWeek({ _action: "SAVE_WEEK", days }, { user: "regular" }),
			);
			expect(response).toBeNull();

			const data = await inViewerTimezone(() => myScheduleData(user.id));

			expect(data.weeks[0].days[SATURDAY].ranges).toEqual([SATURDAY_NIGHT]);
		});

		test("keeps the week as it is when it is saved again untouched", async () => {
			const user = await UserFactory.createRegular();
			const days = currentWeekDays();
			days[SATURDAY].ranges = [SATURDAY_NIGHT];

			await inViewerTimezone(() =>
				saveWeek({ _action: "SAVE_WEEK", days }, { user: "regular" }),
			);
			const firstRead = await inViewerTimezone(() => myScheduleData(user.id));

			await inViewerTimezone(() =>
				saveWeek(
					{ _action: "SAVE_WEEK", days: firstRead.weeks[0].days },
					{ user: "regular" },
				),
			);
			const secondRead = await inViewerTimezone(() => myScheduleData(user.id));

			expect(secondRead.weeks[0].days[SATURDAY].ranges).toEqual(
				firstRead.weeks[0].days[SATURDAY].ranges,
			);
		});
	});

	describe("in the hour around a DST change of the viewer's timezone, with the server in UTC", () => {
		const nearDstChange = [
			{
				why: "first hour of the Monday of the fall-back week (Mon 2026-10-26 00:30 EDT)",
				now: "2026-10-26T04:30:00Z",
			},
			{
				why: "last hour of the Sunday before the spring-forward week (Sun 2026-03-01 23:30 EST)",
				now: "2026-03-02T04:30:00Z",
			},
		];

		beforeEach(() => {
			vi.stubEnv("TZ", "UTC");
			vi.useFakeTimers({ toFake: ["Date"] });
		});
		afterEach(() => {
			vi.useRealTimers();
			vi.unstubAllEnvs();
		});

		test.each(nearDstChange)(
			"shows the week after the current one as the next week: $why",
			async ({ now }) => {
				vi.setSystemTime(new Date(now));
				const user = await UserFactory.createRegular();

				const data = await inNewYork(() => myScheduleData(user.id));

				const currentWeek = Availability.weekRange(new Date(now), NEW_YORK);
				expect(data.weeks[0].weekStartsAt).toBe(currentWeek.startsAt);
				expect(data.weeks[1].weekStartsAt).toBe(currentWeek.endsAt);
			},
		);

		test.each(nearDstChange)("saves the next week: $why", async ({ now }) => {
			vi.setSystemTime(new Date(now));
			await UserFactory.createRegular();
			const nextWeekStartsAt = Availability.weekRange(
				new Date(now),
				NEW_YORK,
			).endsAt;

			const response = await inNewYork(() =>
				saveWeek(
					{
						_action: "SAVE_WEEK",
						days: daysOfWeekStarting(nextWeekStartsAt, NEW_YORK),
					},
					{ user: "regular" },
				),
			);

			expect(response).toBeNull();
		});
	});
});

function daysOfWeekStarting(weekStartsAt: number, timezone: string) {
	return R.range(0, 7).map((dayIndex) => ({
		date: Availability.dateInTimezone(
			weekStartsAt + dayIndex * DAY_SECONDS + DAY_SECONDS / 2,
			timezone,
		),
		ranges: [] as Array<{ start: number; end: number }>,
		note: "",
	}));
}
