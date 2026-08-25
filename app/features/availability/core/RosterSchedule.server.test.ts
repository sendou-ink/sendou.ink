import { beforeEach, describe, expect, test } from "vitest";
import * as AvailabilityWeekFactory from "~/db/seed/factories/AvailabilityWeekFactory";
import * as TeamEventFactory from "~/db/seed/factories/TeamEventFactory";
import * as TeamFactory from "~/db/seed/factories/TeamFactory";
import * as UserFactory from "~/db/seed/factories/UserFactory";
import { AVAILABILITY } from "../availability-constants";
import * as Availability from "./Availability";
import * as RosterSchedule from "./RosterSchedule.server";

const users = UserFactory.pool();
const memberId = () => users.id(1);
const teammateId = () => users.id(2);

const TIMEZONE = "Europe/Helsinki";
const HOUR = 60 * 60;

const currentWeekStartsAt = () =>
	Availability.weekStartsAt(new Date(), TIMEZONE);

const dataOf = (userIds: Array<number>) =>
	RosterSchedule.rosterScheduleData({ userIds, timezone: TIMEZONE });

const memberOf = async (userId: number) =>
	(await dataOf([userId])).members.find((member) => member.userId === userId);

describe("RosterSchedule.rosterScheduleData", () => {
	beforeEach(async () => {
		await users.create(2);
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

	test("reports which of the weeks the member has filled in", async () => {
		await AvailabilityWeekFactory.create({
			userId: memberId(),
			weekStartsAt: currentWeekStartsAt(),
			timezone: TIMEZONE,
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
			timezone: TIMEZONE,
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

describe("RosterSchedule.windowSchedules", () => {
	const window = (id: number, from: number, to: number) => ({
		id,
		startsAt: currentWeekStartsAt() + from * HOUR,
		endsAt: currentWeekStartsAt() + to * HOUR,
	});

	const schedulesOf = async (
		windows: Array<ReturnType<typeof window>>,
		userIds: Array<number> = [memberId()],
	) => RosterSchedule.windowSchedules({ windows, userIds });

	beforeEach(async () => {
		await users.create(2);
	});

	test("reports what the member has free inside the window", async () => {
		await AvailabilityWeekFactory.create({
			userId: memberId(),
			weekStartsAt: currentWeekStartsAt(),
			timezone: TIMEZONE,
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

	test("cuts a commitment out of the availability and reports it", async () => {
		await AvailabilityWeekFactory.create({
			userId: memberId(),
			weekStartsAt: currentWeekStartsAt(),
			timezone: TIMEZONE,
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
