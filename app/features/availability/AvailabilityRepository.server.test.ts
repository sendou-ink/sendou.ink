import { beforeEach, describe, expect, test } from "vitest";
import { actAs } from "~/db/seed/core/actAs";
import * as AvailabilityWeekFactory from "~/db/seed/factories/AvailabilityWeekFactory";
import * as UserFactory from "~/db/seed/factories/UserFactory";
import * as AvailabilityRepository from "./AvailabilityRepository.server";
import * as Availability from "./core/Availability";

const users = UserFactory.pool();

const TIMEZONE = "Europe/Helsinki";

const at = (date: string, time: string) =>
	Availability.localToTimestamp({ date, time, timezone: TIMEZONE });

const WEEK_STARTS_AT = at("2026-08-24", "00:00");
const NEXT_WEEK_STARTS_AT = at("2026-08-31", "00:00");

const WINDOW = {
	startsAt: WEEK_STARTS_AT,
	endsAt: NEXT_WEEK_STARTS_AT,
};

const weeksOf = (userId: number) =>
	AvailabilityRepository.findAllWeeksByUserIds({
		userIds: [userId],
		...WINDOW,
	});

describe("AvailabilityRepository.upsertOwnWeek", () => {
	beforeEach(async () => {
		await users.create(2);
	});

	test("saves the week with its slots and day notes", async () => {
		await AvailabilityWeekFactory.create({
			userId: users.id(1),
			weekStartsAt: WEEK_STARTS_AT,
			timezone: TIMEZONE,
			slots: [
				{
					startsAt: at("2026-08-24", "18:00"),
					endsAt: at("2026-08-24", "22:00"),
				},
			],
			dayNotes: [{ date: "2026-08-24", text: "Have to stop earlier" }],
		});

		const [week] = await weeksOf(users.id(1));

		expect(week.timezone).toBe(TIMEZONE);
		expect(week.slots).toEqual([
			{
				startsAt: at("2026-08-24", "18:00"),
				endsAt: at("2026-08-24", "22:00"),
			},
		]);
		expect(week.dayNotes).toEqual([
			{ date: "2026-08-24", text: "Have to stop earlier" },
		]);
	});

	test("replaces the slots and day notes the week had before", async () => {
		await AvailabilityWeekFactory.create({
			userId: users.id(1),
			weekStartsAt: WEEK_STARTS_AT,
			slots: [
				{
					startsAt: at("2026-08-24", "18:00"),
					endsAt: at("2026-08-24", "22:00"),
				},
			],
			dayNotes: [{ date: "2026-08-24", text: "Have to stop earlier" }],
		});

		await actAs(users.id(1), () =>
			AvailabilityRepository.upsertOwnWeek({
				weekStartsAt: WEEK_STARTS_AT,
				timezone: TIMEZONE,
				slots: [
					{
						startsAt: at("2026-08-25", "19:00"),
						endsAt: at("2026-08-25", "23:00"),
					},
				],
				dayNotes: [],
			}),
		);

		const weeks = await weeksOf(users.id(1));

		expect(weeks).toHaveLength(1);
		expect(weeks[0].slots).toEqual([
			{
				startsAt: at("2026-08-25", "19:00"),
				endsAt: at("2026-08-25", "23:00"),
			},
		]);
		expect(weeks[0].dayNotes).toEqual([]);
	});

	test("keeps a submitted week with no slots, which is how being unavailable all week is reported", async () => {
		await AvailabilityWeekFactory.create({
			userId: users.id(1),
			weekStartsAt: WEEK_STARTS_AT,
		});

		const weeks = await weeksOf(users.id(1));

		expect(weeks).toHaveLength(1);
		expect(weeks[0].slots).toEqual([]);
	});

	test("saves each user's week of their own", async () => {
		await AvailabilityWeekFactory.create({
			userId: users.id(1),
			weekStartsAt: WEEK_STARTS_AT,
		});
		await AvailabilityWeekFactory.create({
			userId: users.id(2),
			weekStartsAt: WEEK_STARTS_AT,
		});

		const weeks = await AvailabilityRepository.findAllWeeksByUserIds({
			userIds: [users.id(1), users.id(2)],
			...WINDOW,
		});

		expect(weeks.map((week) => week.userId).sort()).toEqual(
			[users.id(1), users.id(2)].sort(),
		);
	});
});

describe("AvailabilityRepository.findAllWeeksByUserIds", () => {
	beforeEach(async () => {
		await users.create(1);
	});

	test("leaves out weeks outside the window", async () => {
		await AvailabilityWeekFactory.create({
			userId: users.id(1),
			weekStartsAt: NEXT_WEEK_STARTS_AT,
		});

		expect(await weeksOf(users.id(1))).toEqual([]);
	});

	test("finds a week reported in a timezone whose Monday starts on the window's Sunday", async () => {
		await AvailabilityWeekFactory.create({
			userId: users.id(1),
			weekStartsAt: Availability.weekStartsAt(
				new Date(at("2026-08-26", "12:00") * 1000),
				"Asia/Tokyo",
			),
			timezone: "Asia/Tokyo",
		});

		expect(await weeksOf(users.id(1))).toHaveLength(1);
	});
});

describe("AvailabilityRepository.deleteWeeksStartedBefore", () => {
	beforeEach(async () => {
		await users.create(1);
	});

	test("deletes only the weeks that started before the cutoff", async () => {
		await AvailabilityWeekFactory.create({
			userId: users.id(1),
			weekStartsAt: WEEK_STARTS_AT,
			slots: [
				{
					startsAt: at("2026-08-24", "18:00"),
					endsAt: at("2026-08-24", "22:00"),
				},
			],
		});
		await AvailabilityWeekFactory.create({
			userId: users.id(1),
			weekStartsAt: NEXT_WEEK_STARTS_AT,
		});

		await AvailabilityRepository.deleteWeeksStartedBefore(NEXT_WEEK_STARTS_AT);

		expect(await weeksOf(users.id(1))).toEqual([]);
		expect(
			await AvailabilityRepository.findAllWeeksByUserIds({
				userIds: [users.id(1)],
				startsAt: NEXT_WEEK_STARTS_AT,
				endsAt: at("2026-09-07", "00:00"),
			}),
		).toHaveLength(1);
	});
});
