import * as R from "remeda";
import * as v from "valibot";
import { afterEach, describe, expect, test, vi } from "vitest";
import { addTeamEventSchema, saveWeekSchema } from "./availability-schemas";

const DAY_MINUTES = 24 * 60;

const weekWith = (ranges: Array<{ start: number; end: number }>) => ({
	_action: "SAVE_WEEK" as const,
	days: R.range(0, 7).map((dayIndex) => ({
		date: `2026-08-${String(24 + dayIndex).padStart(2, "0")}`,
		ranges: dayIndex === 0 ? ranges : [],
		note: "",
	})),
});

describe("saveWeekSchema", () => {
	test.each([
		{ why: "a range ending when it starts", start: 600, end: 600 },
		{ why: "a range ending before it starts", start: 600, end: 540 },
		{
			why: "a range longer than a day",
			start: 60,
			end: 60 + DAY_MINUTES + 30,
		},
		{ why: "a range ending past the next day", start: 1380, end: 2881 },
	])("rejects $why", ({ start, end }) => {
		expect(
			v.safeParse(saveWeekSchema, weekWith([{ start, end }])).success,
		).toBe(false);
	});

	test.each([
		{ why: "a range within one day", start: 600, end: 720 },
		{ why: "a range crossing midnight", start: 1380, end: 1500 },
		{ why: "a range exactly a day long", start: 0, end: DAY_MINUTES },
		{
			why: "the last minute a range can start",
			start: DAY_MINUTES - 1,
			end: DAY_MINUTES,
		},
	])("accepts $why", ({ start, end }) => {
		expect(
			v.safeParse(saveWeekSchema, weekWith([{ start, end }])).success,
		).toBe(true);
	});
});

describe("addTeamEventSchema", () => {
	const originalTimezone = process.env.TZ;

	afterEach(() => {
		vi.useRealTimers();
		if (originalTimezone === undefined) {
			delete process.env.TZ;
		} else {
			process.env.TZ = originalTimezone;
		}
	});

	const eventStartingAt = (startsAt: Date) => ({
		_action: "ADD_EVENT",
		name: "Practice",
		startsAt: startsAt.getTime(),
		duration: "60",
		participants: "ALL",
		participantUserIds: [],
	});

	test.each([
		{
			why: "Tokyo, Monday 08:00",
			clientTimezone: "Asia/Tokyo",
			now: "2026-10-11T23:00:00Z",
			nextWeekSaturdayEvening: "2026-10-24T09:00:00Z",
		},
		{
			why: "Sydney, Monday 09:00",
			clientTimezone: "Australia/Sydney",
			now: "2026-10-11T22:00:00Z",
			nextWeekSaturdayEvening: "2026-10-24T08:00:00Z",
		},
		{
			why: "Auckland, Monday 10:00",
			clientTimezone: "Pacific/Auckland",
			now: "2026-10-11T21:00:00Z",
			nextWeekSaturdayEvening: "2026-10-24T06:00:00Z",
		},
	])(
		"accepts an event next week on the server once the client's week rolled over ($why)",
		({ clientTimezone, now, nextWeekSaturdayEvening }) => {
			vi.useFakeTimers();
			vi.setSystemTime(new Date(now));
			const event = eventStartingAt(new Date(nextWeekSaturdayEvening));

			process.env.TZ = clientTimezone;
			expect(v.safeParse(addTeamEventSchema, event).success).toBe(true);

			process.env.TZ = "UTC";
			const onServer = v.safeParse(addTeamEventSchema, event);

			expect(onServer.issues?.map((issue) => issue.message)).toBeUndefined();
		},
	);
});
