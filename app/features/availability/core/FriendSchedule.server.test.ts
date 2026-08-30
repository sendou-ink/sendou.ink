import { addWeeks } from "date-fns";
import { beforeEach, describe, expect, test } from "vitest";
import * as AvailabilityWeekFactory from "~/db/seed/factories/AvailabilityWeekFactory";
import * as TeamEventFactory from "~/db/seed/factories/TeamEventFactory";
import * as TeamFactory from "~/db/seed/factories/TeamFactory";
import * as UserFactory from "~/db/seed/factories/UserFactory";
import * as Availability from "./Availability";
import * as FriendSchedule from "./FriendSchedule.server";

const users = UserFactory.pool();
const friendId = () => users.id(1);
const otherId = () => users.id(2);

const TIMEZONE = "Europe/Helsinki";
const HOUR = 60 * 60;

const currentWeekStartsAt = () =>
	Availability.weekStartsAt(new Date(), TIMEZONE);
const nextWeekStartsAt = () =>
	Availability.weekStartsAt(addWeeks(new Date(), 1), TIMEZONE);

const weeksOf = async (userId: number) => {
	const schedules = await FriendSchedule.findByUserIds({
		userIds: [friendId(), otherId()],
		timezone: TIMEZONE,
	});

	return schedules.get(userId);
};

describe("FriendSchedule.findByUserIds", () => {
	beforeEach(async () => {
		await users.create(2);
	});

	test("leaves out a user who reported neither week", async () => {
		await AvailabilityWeekFactory.create({
			userId: friendId(),
			weekStartsAt: currentWeekStartsAt(),
			timezone: TIMEZONE,
		});

		expect(await weeksOf(otherId())).toBeUndefined();
	});

	test("marks the week they filled in as reported and the other one not", async () => {
		await AvailabilityWeekFactory.create({
			userId: friendId(),
			weekStartsAt: nextWeekStartsAt(),
			timezone: TIMEZONE,
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
			timezone: TIMEZONE,
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
			timezone: TIMEZONE,
			slots: [slot],
		});
		const team = await TeamFactory.create({
			memberUserIds: [friendId(), otherId()],
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
