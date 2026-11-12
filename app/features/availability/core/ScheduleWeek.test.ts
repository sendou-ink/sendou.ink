import { addWeeks } from "date-fns";
import { describe, expect, test } from "vitest";
import type {
	BusyBlock,
	PlayableWindowTier,
	TimeRange,
} from "../availability-types";
import * as Availability from "./Availability";
import * as DayTrack from "./DayTrack";
import * as ScheduleWeek from "./ScheduleWeek";

const DAY_SECONDS = 24 * 60 * 60;
const TIMEZONE = "UTC";
const HELSINKI = "Europe/Helsinki";
const FRIDAY = 4;
const SATURDAY = 5;

describe("ScheduleWeek.memberRow", () => {
	test("shows a member free on Saturday when their Friday night range runs into their Saturday morning range", () => {
		const { fridayAt } = nextWeek();

		// what SAVE_WEEK stores for Fri 20:00-06:00 + Sat 06:00-10:00
		const slots = Availability.normalize([
			{ startsAt: fridayAt(20 * 60), endsAt: fridayAt(30 * 60) },
			{ startsAt: fridayAt(30 * 60), endsAt: fridayAt(34 * 60) },
		]);

		const row = rowWith({ slots });

		expect(row.days[SATURDAY].ranges).toEqual([
			{ startsAt: fridayAt(30 * 60), endsAt: fridayAt(34 * 60) },
		]);
	});

	test("keeps the whole reported range in reportedRanges when a commitment covers it", () => {
		const { fridayAt } = nextWeek();
		const slots = [{ startsAt: fridayAt(18 * 60), endsAt: fridayAt(23 * 60) }];

		const row = rowWith({
			slots,
			busy: [
				{
					type: "tournament",
					name: "Triton",
					startsAt: fridayAt(17 * 60),
					endsAt: fridayAt(23 * 60 + 30),
				},
			],
		});

		expect(row.days[FRIDAY].ranges).toEqual([]);
		expect(row.days[FRIDAY].reportedRanges).toEqual(slots);
	});

	test("cuts a commitment out of ranges but not out of reportedRanges", () => {
		const { fridayAt } = nextWeek();
		const slots = [{ startsAt: fridayAt(18 * 60), endsAt: fridayAt(23 * 60) }];

		const row = rowWith({
			slots,
			busy: [
				{
					type: "scrim",
					name: null,
					startsAt: fridayAt(19 * 60),
					endsAt: fridayAt(21 * 60),
				},
			],
		});

		expect(row.days[FRIDAY].ranges).toEqual([
			{ startsAt: fridayAt(18 * 60), endsAt: fridayAt(19 * 60) },
			{ startsAt: fridayAt(21 * 60), endsAt: fridayAt(23 * 60) },
		]);
		expect(row.days[FRIDAY].reportedRanges).toEqual(slots);
	});

	test("merges adjacent reported slots into one range", () => {
		const { fridayAt } = nextWeek();

		// the editor stores one row per painted span, so a 06:00-19:00 evening
		// arrives as two touching slots
		const row = rowWith({
			slots: [
				{ startsAt: fridayAt(6 * 60), endsAt: fridayAt(8 * 60) },
				{ startsAt: fridayAt(8 * 60), endsAt: fridayAt(19 * 60) },
			],
		});

		expect(row.days[FRIDAY].reportedRanges).toEqual([
			{ startsAt: fridayAt(6 * 60), endsAt: fridayAt(19 * 60) },
		]);
	});

	test("leaves reportedRanges empty for a week that was never filled in", () => {
		const { fridayAt } = nextWeek();

		const row = rowWith({
			slots: [],
			busy: [
				{
					type: "teamEvent",
					name: "Practice",
					startsAt: fridayAt(19 * 60),
					endsAt: fridayAt(21 * 60),
				},
			],
			reported: false,
		});

		expect(row.reported).toBe(false);
		expect(row.days[FRIDAY].reportedRanges).toEqual([]);
		expect(row.days[FRIDAY].busy).toHaveLength(1);
	});
});

describe("ScheduleWeek.days", () => {
	test("lays the week out on seven consecutive days, Monday first", () => {
		const range = Availability.weekRange(
			new Date("2026-08-26T12:00:00Z"),
			HELSINKI,
		);

		expect(ScheduleWeek.days(range, HELSINKI).map((day) => day.date)).toEqual([
			"2026-08-24",
			"2026-08-25",
			"2026-08-26",
			"2026-08-27",
			"2026-08-28",
			"2026-08-29",
			"2026-08-30",
		]);
	});
});

describe("ScheduleWeek.weekNumber", () => {
	test("is the ISO number of the week", () => {
		const range = Availability.weekRange(
			new Date("2026-08-26T12:00:00Z"),
			HELSINKI,
		);

		expect(ScheduleWeek.weekNumber(range, HELSINKI)).toBe(35);
	});
});

describe("ScheduleWeek.teamWindows", () => {
	test("needs four players free when the roster has more", () => {
		const { range, weekStartsAt, fridayAt } = nextWeek();
		const evening = { startsAt: fridayAt(18 * 60), endsAt: fridayAt(22 * 60) };

		const { minPlayers, windows } = ScheduleWeek.teamWindows({
			range,
			playerIds: [1, 2, 3, 4, 5],
			reportedWeeks: [1, 2, 3, 4].map((userId) =>
				reportedWeek({ userId, weekStartsAt, slots: [evening] }),
			),
			busyByUserId: new Map(),
		});

		expect(minPlayers).toBe(4);
		expect(windows).toMatchObject([{ ...evening, tier: "FULL" }]);
	});

	test("needs every player of a smaller roster", () => {
		const { range, weekStartsAt, fridayAt } = nextWeek();
		const evening = { startsAt: fridayAt(18 * 60), endsAt: fridayAt(22 * 60) };

		const { minPlayers, windows } = ScheduleWeek.teamWindows({
			range,
			playerIds: [1, 2],
			reportedWeeks: [1, 2].map((userId) =>
				reportedWeek({ userId, weekStartsAt, slots: [evening] }),
			),
			busyByUserId: new Map(),
		});

		expect(minPlayers).toBe(2);
		expect(windows).toMatchObject([{ tier: "FULL" }]);
	});

	test("cuts a player's commitments out before looking for windows", () => {
		const { range, weekStartsAt, fridayAt } = nextWeek();
		const evening = { startsAt: fridayAt(18 * 60), endsAt: fridayAt(22 * 60) };

		const { windows } = ScheduleWeek.teamWindows({
			range,
			playerIds: [1, 2],
			reportedWeeks: [1, 2].map((userId) =>
				reportedWeek({ userId, weekStartsAt, slots: [evening] }),
			),
			busyByUserId: new Map([
				[
					2,
					[
						{
							type: "scrim",
							name: null,
							startsAt: fridayAt(20 * 60),
							endsAt: fridayAt(22 * 60),
						},
					],
				],
			]),
		});

		expect(windows).toMatchObject([
			{ startsAt: fridayAt(18 * 60), endsAt: fridayAt(20 * 60), tier: "FULL" },
		]);
	});
});

describe("ScheduleWeek.bestWindowTierOfDay", () => {
	const { days, fridayAt } = nextWeek();
	const window = (tier: PlayableWindowTier) => ({
		startsAt: fridayAt(18 * 60),
		endsAt: fridayAt(20 * 60),
		tier,
	});

	test.each([
		{
			why: "a full window wins over one short",
			tiers: ["ONE_SHORT", "FULL"],
			expected: "FULL",
		},
		{
			why: "one short without a full one",
			tiers: ["ONE_SHORT"],
			expected: "ONE_SHORT",
		},
		{ why: "no windows", tiers: [], expected: null },
	] as const)("$why", ({ tiers, expected }) => {
		expect(
			ScheduleWeek.bestWindowTierOfDay({
				date: days[FRIDAY].date,
				windows: tiers.map(window),
				timezone: TIMEZONE,
			}),
		).toBe(expected);
	});

	test("ignores windows starting on another day", () => {
		expect(
			ScheduleWeek.bestWindowTierOfDay({
				date: days[SATURDAY].date,
				windows: [window("FULL")],
				timezone: TIMEZONE,
			}),
		).toBeNull();
	});
});

function nextWeek() {
	const weekStartsAt = Availability.weekStartsAt(
		addWeeks(new Date(), 1),
		TIMEZONE,
	);
	const range = {
		startsAt: weekStartsAt,
		endsAt: weekStartsAt + 7 * DAY_SECONDS,
	};
	const days = ScheduleWeek.days(range, TIMEZONE);

	return {
		weekStartsAt,
		range,
		days,
		fridayAt: (minutes: number) =>
			DayTrack.dayMinutesToTimestamp({
				date: days[FRIDAY].date,
				minutes,
				timezone: TIMEZONE,
			}),
	};
}

function reportedWeek({
	userId,
	weekStartsAt,
	slots,
}: {
	userId: number;
	weekStartsAt: number;
	slots: Array<TimeRange>;
}): ScheduleWeek.ReportedWeek {
	return { userId, weekStartsAt, timezone: TIMEZONE, slots, dayNotes: [] };
}

function rowWith({
	slots,
	busy = [],
	reported = true,
}: {
	slots: Array<TimeRange>;
	busy?: Array<BusyBlock>;
	reported?: boolean;
}) {
	const { weekStartsAt, range, days } = nextWeek();

	return ScheduleWeek.memberRow({
		userId: 1,
		days,
		timezone: TIMEZONE,
		reportedWeeks: reported
			? [{ userId: 1, weekStartsAt, timezone: TIMEZONE, slots, dayNotes: [] }]
			: [],
		range,
		busy,
	});
}
