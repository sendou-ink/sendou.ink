import { addWeeks, subWeeks } from "date-fns";
import * as R from "remeda";
import * as v from "valibot";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import * as AvailabilityWeekFactory from "~/db/seed/factories/AvailabilityWeekFactory";
import * as TeamEventFactory from "~/db/seed/factories/TeamEventFactory";
import * as TeamFactory from "~/db/seed/factories/TeamFactory";
import * as UserFactory from "~/db/seed/factories/UserFactory";
import { viewerTimezoneAsyncLocalStorage } from "~/features/timezone/timezone-context.server";
import { databaseTimestampToDate } from "~/utils/dates";
import { wrappedAction } from "~/utils/Test";
import { action as eventsAction } from "../actions/events.server";
import { AVAILABILITY } from "../availability-constants";
import { saveWeekSchema } from "../availability-schemas";
import * as Availability from "./Availability";
import * as ScheduleViews from "./ScheduleViews.server";

const users = UserFactory.pool();
const viewerId = () => users.id(3);
// whose schedules are read: a roster's members, two friends of the viewer or a tournament player
const memberId = () => users.id(1);
const teammateId = () => users.id(2);
const friendId = () => users.id(1);
const otherFriendId = () => users.id(2);
const playerId = () => users.id(1);

const TIMEZONE = "UTC";
const HELSINKI = "Europe/Helsinki";
const HOUR = 60 * 60;
const DAY = 24 * HOUR;

const currentWeekStartsAt = () =>
	Availability.weekStartsAt(new Date(), HELSINKI);

describe("ScheduleViews.myScheduleData", () => {
	const saveWeek = wrappedAction<typeof saveWeekSchema>({
		action: eventsAction,
		isJsonSubmission: true,
	});

	const weekDays = () => {
		const weekStartsAt = Availability.weekStartsAt(
			addWeeks(new Date(), 1),
			TIMEZONE,
		);

		return R.range(0, 7).map((dayIndex) => ({
			date: Availability.dateInTimezone(
				weekStartsAt + dayIndex * DAY + DAY / 2,
				TIMEZONE,
			),
			ranges: [] as Array<{ start: number; end: number }>,
			note: "",
		}));
	};

	// editor with both expanders open: 06:00 -> 06:00 the next day
	const WHOLE_TRACK = { start: 6 * 60, end: 30 * 60 };
	const FRIDAY = 4;
	const SATURDAY = 5;

	// Tuesday of the week whose Saturday night has the fall-back transition (Sun 2026-10-25 04:00 -> 03:00)
	const NOW = new Date("2026-10-20T12:00:00Z");
	const SATURDAY_NIGHT = { start: 22 * 60, end: 28 * 60 };

	const inViewerTimezone = <T>(fn: () => Promise<T>) =>
		viewerTimezoneAsyncLocalStorage.run({ timezone: HELSINKI }, fn);

	const currentWeekDays = () => {
		const weekStartsAt = Availability.weekStartsAt(NOW, HELSINKI);

		return R.range(0, 7).map((dayIndex) => ({
			date: Availability.dateInTimezone(
				weekStartsAt + dayIndex * DAY + DAY / 2,
				HELSINKI,
			),
			ranges: [] as Array<{ start: number; end: number }>,
			note: "",
		}));
	};

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

		const data = await ScheduleViews.myScheduleData(user.id);
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

		const data = await ScheduleViews.myScheduleData(user.id);
		const nextWeek = data.weeks[1];

		expect(nextWeek.days[SATURDAY].ranges).toEqual([WHOLE_TRACK]);
	});

	test("reads a weekend painted as whole tracks back in a shape that can be saved again", async () => {
		const user = await UserFactory.createRegular();
		const days = weekDays();
		days[FRIDAY].ranges = [WHOLE_TRACK];
		days[SATURDAY].ranges = [WHOLE_TRACK];

		await saveWeek({ _action: "SAVE_WEEK", days }, { user: "regular" });

		const data = await ScheduleViews.myScheduleData(user.id);
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

			const data = await inViewerTimezone(() =>
				ScheduleViews.myScheduleData(user.id),
			);

			expect(data.weeks[0].days[SATURDAY].ranges).toEqual([SATURDAY_NIGHT]);
		});

		test("keeps the week as it is when it is saved again untouched", async () => {
			const user = await UserFactory.createRegular();
			const days = currentWeekDays();
			days[SATURDAY].ranges = [SATURDAY_NIGHT];

			await inViewerTimezone(() =>
				saveWeek({ _action: "SAVE_WEEK", days }, { user: "regular" }),
			);
			const firstRead = await inViewerTimezone(() =>
				ScheduleViews.myScheduleData(user.id),
			);

			await inViewerTimezone(() =>
				saveWeek(
					{ _action: "SAVE_WEEK", days: firstRead.weeks[0].days },
					{ user: "regular" },
				),
			);
			const secondRead = await inViewerTimezone(() =>
				ScheduleViews.myScheduleData(user.id),
			);

			expect(secondRead.weeks[0].days[SATURDAY].ranges).toEqual(
				firstRead.weeks[0].days[SATURDAY].ranges,
			);
		});
	});
});

describe("ScheduleViews.friendWeeks", () => {
	const nextWeekStartsAt = () =>
		Availability.weekStartsAt(addWeeks(new Date(), 1), HELSINKI);

	const weeksOf = async (userId: number) => {
		const schedules = await ScheduleViews.friendWeeks({
			userIds: [friendId(), otherFriendId()],
			timezone: HELSINKI,
			viewerId: viewerId(),
		});

		return schedules.get(userId);
	};

	beforeEach(async () => {
		await users.create(3);
	});

	test("leaves out a user who reported neither week", async () => {
		await AvailabilityWeekFactory.create({
			userId: friendId(),
			weekStartsAt: currentWeekStartsAt(),
			timezone: HELSINKI,
		});

		expect(await weeksOf(otherFriendId())).toBeUndefined();
	});

	test("leaves out a user not sharing their schedule with the viewer", async () => {
		await AvailabilityWeekFactory.create({
			userId: friendId(),
			weekStartsAt: currentWeekStartsAt(),
			timezone: HELSINKI,
		});
		await UserFactory.grant(friendId(), {
			preferences: { scheduleVisibility: { friends: false, teamIds: [] } },
		});

		expect(await weeksOf(friendId())).toBeUndefined();
	});

	test("marks the week they filled in as reported and the other one not", async () => {
		await AvailabilityWeekFactory.create({
			userId: friendId(),
			weekStartsAt: nextWeekStartsAt(),
			timezone: HELSINKI,
		});

		expect(
			(await weeksOf(friendId()))?.map((week) => [week.week, week.reported]),
		).toEqual([
			["current", false],
			["next", true],
		]);
	});

	test("buckets the reported ranges into the days they start on", async () => {
		const wednesdayEvening = {
			startsAt: currentWeekStartsAt() + 2 * 24 * HOUR + 18 * HOUR,
			endsAt: currentWeekStartsAt() + 2 * 24 * HOUR + 22 * HOUR,
		};
		await AvailabilityWeekFactory.create({
			userId: friendId(),
			weekStartsAt: currentWeekStartsAt(),
			timezone: HELSINKI,
			slots: [wednesdayEvening],
		});

		const days = (await weeksOf(friendId()))?.[0].days;

		expect(days?.flatMap((day) => day.ranges)).toEqual([wednesdayEvening]);
		expect(days?.[2].ranges).toEqual([wednesdayEvening]);
	});

	test("cuts a commitment out of the reported ranges", async () => {
		const slot = {
			startsAt: currentWeekStartsAt() + 18 * HOUR,
			endsAt: currentWeekStartsAt() + 22 * HOUR,
		};
		await AvailabilityWeekFactory.create({
			userId: friendId(),
			weekStartsAt: currentWeekStartsAt(),
			timezone: HELSINKI,
			slots: [slot],
		});
		const team = await TeamFactory.create({
			memberUserIds: [friendId(), otherFriendId()],
		});
		await TeamEventFactory.create({
			teamId: team.id,
			authorId: friendId(),
			name: "VoD review",
			startsAt: slot.startsAt + HOUR,
			endsAt: slot.endsAt,
		});

		const day = (await weeksOf(friendId()))?.[0].days[0];

		expect(day?.ranges).toEqual([
			{ startsAt: slot.startsAt, endsAt: slot.startsAt + HOUR },
		]);
	});
});

describe("ScheduleViews.registrationAvailability", () => {
	const weekStartsAtIn = (weeksFromNow: number) =>
		Availability.weekStartsAt(addWeeks(new Date(), weeksFromNow), TIMEZONE);

	const tournamentStartingAt = (startsAt: number) => ({
		id: 1,
		name: "In The Zone",
		organizationId: null,
		startsAt,
		minMembersPerTeam: 4,
		bracketTypes: ["single_elimination" as const],
		teamCount: 8,
	});

	const availabilityFor = (startsAt: number) =>
		ScheduleViews.registrationAvailability({
			tournament: tournamentStartingAt(startsAt),
			userIds: [playerId()],
			timezone: TIMEZONE,
			viewerId: viewerId(),
		});

	beforeEach(async () => {
		await users.create(3);
	});

	test("computes nothing for a tournament past the reportable horizon", async () => {
		const startsAt = weekStartsAtIn(AVAILABILITY.WEEK_HORIZON) + 18 * HOUR;

		const result = await availabilityFor(startsAt);

		expect(result.window).toBeNull();
		expect(result.entries).toBeNull();
		expect(result.beyondHorizon?.opensAt).toBe(
			Availability.weekStartsAt(
				subWeeks(databaseTimestampToDate(startsAt), 1),
				TIMEZONE,
			),
		);
	});

	test("computes availability for a tournament on the last day still within the horizon", async () => {
		const startsAt = weekStartsAtIn(AVAILABILITY.WEEK_HORIZON) - HOUR;

		const result = await availabilityFor(startsAt);

		expect(result.beyondHorizon).toBeNull();
		expect(result.window?.startsAt).toBe(startsAt);
		expect(result.entries).toHaveLength(1);
	});

	test("reads as unknown for a player not sharing their schedule", async () => {
		const weekStartsAt = weekStartsAtIn(1);
		const startsAt = weekStartsAt + 2 * DAY + 18 * HOUR;
		await AvailabilityWeekFactory.create({
			userId: playerId(),
			weekStartsAt,
			timezone: TIMEZONE,
			slots: [{ startsAt, endsAt: startsAt + 6 * HOUR }],
			dayNotes: [
				{
					date: Availability.dateInTimezone(startsAt, TIMEZONE),
					text: "Have to leave by 21",
				},
			],
		});
		await UserFactory.grant(playerId(), {
			preferences: { scheduleVisibility: { friends: false, teamIds: [] } },
		});

		const result = await availabilityFor(startsAt);

		expect(result.entries?.[0].availability.status).toBe("unknown");
		expect(result.entries?.[0].notes).toEqual([]);
	});

	test("returns only the day notes falling inside the tournament's window", async () => {
		const weekStartsAt = weekStartsAtIn(1);
		const startsAt = weekStartsAt + 2 * DAY + 18 * HOUR;
		const dateOfDay = (dayIndex: number) =>
			Availability.dateInTimezone(
				weekStartsAt + dayIndex * DAY + DAY / 2,
				TIMEZONE,
			);
		await AvailabilityWeekFactory.create({
			userId: playerId(),
			weekStartsAt,
			timezone: TIMEZONE,
			dayNotes: [
				{ date: dateOfDay(2), text: "Have to leave by 21" },
				{ date: dateOfDay(5), text: "Away for the weekend" },
			],
		});

		const result = await availabilityFor(startsAt);

		expect(result.entries?.[0].notes).toEqual(["Have to leave by 21"]);
	});
});

describe("ScheduleViews.rosterScheduleData", () => {
	const dataOf = (userIds: Array<number>) =>
		ScheduleViews.rosterScheduleData({
			userIds,
			timezone: HELSINKI,
			viewerId: viewerId(),
		});

	const memberOf = async (userId: number) =>
		(await dataOf([userId])).members.find((member) => member.userId === userId);

	beforeEach(async () => {
		await users.create(3);
	});

	test("lays out the current and the next week as seven days each", async () => {
		const { weeks } = await dataOf([memberId()]);

		expect(weeks).toHaveLength(2);
		expect(weeks[0].startsAt).toBe(currentWeekStartsAt());
		expect(weeks[1].startsAt).toBe(weeks[0].endsAt);

		for (const week of weeks) {
			expect(week.days).toHaveLength(7);
			expect(week.days[0].startsAt).toBe(week.startsAt);
			expect(week.days[6].endsAt).toBe(week.endsAt);
		}
	});

	test("keeps an entry for a member not sharing their schedule, with nothing in it", async () => {
		await AvailabilityWeekFactory.create({
			userId: memberId(),
			weekStartsAt: currentWeekStartsAt(),
			timezone: HELSINKI,
			slots: [
				{
					startsAt: currentWeekStartsAt() + 18 * HOUR,
					endsAt: currentWeekStartsAt() + 22 * HOUR,
				},
			],
		});
		await UserFactory.grant(memberId(), {
			preferences: { scheduleVisibility: { friends: false, teamIds: [] } },
		});

		expect(await memberOf(memberId())).toEqual({
			userId: memberId(),
			reportedWeekStarts: [],
			ranges: [],
		});
	});

	test("reports which of the weeks the member has filled in", async () => {
		await AvailabilityWeekFactory.create({
			userId: memberId(),
			weekStartsAt: currentWeekStartsAt(),
			timezone: HELSINKI,
		});

		expect((await memberOf(memberId()))?.reportedWeekStarts).toEqual([
			currentWeekStartsAt(),
		]);
	});

	test("cuts a commitment out of the reported availability", async () => {
		const slot = {
			startsAt: currentWeekStartsAt() + 18 * HOUR,
			endsAt: currentWeekStartsAt() + 22 * HOUR,
		};
		await AvailabilityWeekFactory.create({
			userId: memberId(),
			weekStartsAt: currentWeekStartsAt(),
			timezone: HELSINKI,
			slots: [slot],
		});
		const team = await TeamFactory.create({
			memberUserIds: [memberId(), teammateId()],
		});
		await TeamEventFactory.create({
			teamId: team.id,
			authorId: memberId(),
			name: "VoD review",
			startsAt: slot.startsAt + HOUR,
			endsAt: slot.startsAt + 2 * HOUR,
		});

		const member = await memberOf(memberId());

		expect(member?.ranges).toEqual([
			{ startsAt: slot.startsAt, endsAt: slot.startsAt + HOUR },
			{ startsAt: slot.startsAt + 2 * HOUR, endsAt: slot.endsAt },
		]);
	});

	test("returns a member with nothing reported as an empty week", async () => {
		expect(await memberOf(memberId())).toEqual({
			userId: memberId(),
			reportedWeekStarts: [],
			ranges: [],
		});
	});
});

describe("ScheduleViews.windowSchedules", () => {
	const window = (id: number, from: number, to: number) => ({
		id,
		startsAt: currentWeekStartsAt() + from * HOUR,
		endsAt: currentWeekStartsAt() + to * HOUR,
	});

	const schedulesOf = async (
		windows: Array<ReturnType<typeof window>>,
		userIds: Array<number> = [memberId()],
	) =>
		ScheduleViews.windowSchedules({ windows, userIds, viewerId: viewerId() });

	beforeEach(async () => {
		await users.create(3);
	});

	test("reports what the member has free inside the window", async () => {
		await AvailabilityWeekFactory.create({
			userId: memberId(),
			weekStartsAt: currentWeekStartsAt(),
			timezone: HELSINKI,
			slots: [
				{
					startsAt: currentWeekStartsAt() + 18 * HOUR,
					endsAt: currentWeekStartsAt() + 22 * HOUR,
				},
			],
		});

		const [schedules] = await schedulesOf([window(1, 20, 23)]);

		expect(schedules.members).toEqual([
			{
				userId: memberId(),
				reported: true,
				ranges: [
					{
						startsAt: currentWeekStartsAt() + 20 * HOUR,
						endsAt: currentWeekStartsAt() + 22 * HOUR,
					},
				],
				busy: [],
			},
		]);
	});

	test("keeps an entry for a member not sharing their schedule, with nothing in it", async () => {
		await AvailabilityWeekFactory.create({
			userId: memberId(),
			weekStartsAt: currentWeekStartsAt(),
			timezone: HELSINKI,
			slots: [
				{
					startsAt: currentWeekStartsAt() + 18 * HOUR,
					endsAt: currentWeekStartsAt() + 22 * HOUR,
				},
			],
		});
		await UserFactory.grant(memberId(), {
			preferences: { scheduleVisibility: { friends: false, teamIds: [] } },
		});

		const [schedules] = await schedulesOf([window(1, 20, 23)]);

		expect(schedules.members).toEqual([
			{ userId: memberId(), reported: false, ranges: [], busy: [] },
		]);
	});

	test("cuts a commitment out of the availability and reports it", async () => {
		await AvailabilityWeekFactory.create({
			userId: memberId(),
			weekStartsAt: currentWeekStartsAt(),
			timezone: HELSINKI,
			slots: [
				{
					startsAt: currentWeekStartsAt() + 18 * HOUR,
					endsAt: currentWeekStartsAt() + 22 * HOUR,
				},
			],
		});
		const team = await TeamFactory.create({
			memberUserIds: [memberId(), teammateId()],
		});
		await TeamEventFactory.create({
			teamId: team.id,
			authorId: memberId(),
			name: "VoD review",
			startsAt: currentWeekStartsAt() + 19 * HOUR,
			endsAt: currentWeekStartsAt() + 20 * HOUR,
		});

		const [schedules] = await schedulesOf([window(1, 18, 22)]);

		expect(schedules.members[0].ranges).toEqual([
			{
				startsAt: currentWeekStartsAt() + 18 * HOUR,
				endsAt: currentWeekStartsAt() + 19 * HOUR,
			},
			{
				startsAt: currentWeekStartsAt() + 20 * HOUR,
				endsAt: currentWeekStartsAt() + 22 * HOUR,
			},
		]);
		expect(schedules.members[0].busy).toHaveLength(1);
	});

	test("marks a week the member never filled in as not reported", async () => {
		const [schedules] = await schedulesOf([window(1, 18, 20)]);

		expect(schedules.members[0].reported).toBe(false);
	});

	test("leaves out a window past the reportable horizon", async () => {
		const beyond = 24 * 7 * (AVAILABILITY.WEEK_HORIZON + 1);

		expect(await schedulesOf([window(1, beyond, beyond + 2)])).toEqual([]);
	});
});
