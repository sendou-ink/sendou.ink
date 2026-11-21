import { afterAll, beforeAll, describe, expect, test } from "vitest";
import {
	instantToWallClock,
	wallClockToInstant,
	weekNumberToDate,
	weekNumberToDateRange,
	zonesReadSameClock,
} from "./dates";

describe("weekNumberToDate", () => {
	// the bug only manifests west of UTC
	const originalTimezone = process.env.TZ;
	beforeAll(() => {
		process.env.TZ = "America/Los_Angeles";
	});
	afterAll(() => {
		process.env.TZ = originalTimezone;
	});

	test("returns the Monday of the ISO week regardless of server timezone", () => {
		// ISO week 1 of 2024 starts on Monday 2024-01-01
		const start = weekNumberToDate({ week: 1, year: 2024 });

		expect(start.toISOString().slice(0, 10)).toBe("2024-01-01");
	});
});

describe("weekNumberToDateRange", () => {
	// a timezone west of UTC observing DST
	const originalTimezone = process.env.TZ;
	beforeAll(() => {
		process.env.TZ = "America/New_York";
	});
	afterAll(() => {
		process.env.TZ = originalTimezone;
	});

	const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

	test("spans exactly seven days even when the week contains a DST transition", () => {
		// US spring-forward Sunday 2025-03-09 falls inside ISO week 10 (Mon 03-03 .. Mon 03-10)
		const { startTime, endTime } = weekNumberToDateRange({
			week: 10,
			year: 2025,
		});

		expect(endTime.getTime() - startTime.getTime()).toBe(SEVEN_DAYS_MS);
	});

	test("spans exactly seven days for an ordinary week", () => {
		const { startTime, endTime } = weekNumberToDateRange({
			week: 20,
			year: 2025,
		});

		expect(endTime.getTime() - startTime.getTime()).toBe(SEVEN_DAYS_MS);
	});
});

describe("wallClockToInstant", () => {
	// the browser's zone, it changes its clocks on different days than the venue
	const originalTimezone = process.env.TZ;
	beforeAll(() => {
		process.env.TZ = "Europe/Helsinki";
	});
	afterAll(() => {
		process.env.TZ = originalTimezone;
	});

	test.each([
		{
			why: "before US DST starts",
			day: [2026, 2, 7],
			expected: "2026-03-07T16:00:00.000Z",
		},
		{
			why: "after US DST starts",
			day: [2026, 2, 9],
			expected: "2026-03-09T15:00:00.000Z",
		},
		{
			why: "before EU DST ends",
			day: [2026, 9, 24],
			expected: "2026-10-24T15:00:00.000Z",
		},
		{
			why: "after EU DST ends, US not yet",
			day: [2026, 9, 26],
			expected: "2026-10-26T15:00:00.000Z",
		},
		{
			why: "after US DST ends",
			day: [2026, 10, 2],
			expected: "2026-11-02T16:00:00.000Z",
		},
	])("10:00 in Chicago $why", ({ day, expected }) => {
		const [year, month, date] = day as [number, number, number];
		const wallClock = new Date(Date.UTC(year, month, date, 10, 0));

		expect(wallClockToInstant(wallClock, "America/Chicago").toISOString()).toBe(
			expected,
		);
	});

	test("keeps a venue time the local zone skips (its spring-forward hour)", () => {
		const wallClock = new Date(Date.UTC(2026, 2, 29, 3, 30));

		expect(wallClockToInstant(wallClock, "America/Chicago").toISOString()).toBe(
			"2026-03-29T08:30:00.000Z",
		);
	});
});

describe("instantToWallClock", () => {
	const originalTimezone = process.env.TZ;
	beforeAll(() => {
		process.env.TZ = "Europe/Helsinki";
	});
	afterAll(() => {
		process.env.TZ = originalTimezone;
	});

	test.each([
		{ why: "in CST", instant: "2026-03-07T16:00:00.000Z", date: 7 },
		{ why: "in CDT", instant: "2026-03-09T15:00:00.000Z", date: 9 },
		{
			why: "after EU DST ends, US not yet",
			instant: "2026-10-26T15:00:00.000Z",
			date: 26,
		},
	])("reads the venue clock $why", ({ instant, date }) => {
		const wallClock = instantToWallClock(new Date(instant), "America/Chicago");

		expect(wallClock.getUTCDate()).toBe(date);
		expect(wallClock.getUTCHours()).toBe(10);
		expect(wallClock.getUTCMinutes()).toBe(0);
	});

	test("reads a venue time the local zone skips (its spring-forward hour)", () => {
		const wallClock = instantToWallClock(
			new Date("2026-03-29T08:30:00.000Z"),
			"America/Chicago",
		);

		expect(wallClock.toISOString()).toBe("2026-03-29T03:30:00.000Z");
	});

	test.each([
		{ why: "Chicago", timeZone: "America/Chicago" },
		{ why: "Tokyo (crosses the date line)", timeZone: "Asia/Tokyo" },
		{ why: "Kathmandu (45 min offset)", timeZone: "Asia/Kathmandu" },
	])("round trips with wallClockToInstant in $why", ({ timeZone }) => {
		const wallClock = new Date(Date.UTC(2026, 10, 1, 23, 45));

		expect(
			instantToWallClock(wallClockToInstant(wallClock, timeZone), timeZone),
		).toEqual(wallClock);
	});
});

describe("zonesReadSameClock", () => {
	const FROM = new Date("2026-11-19T12:00:00.000Z");

	test.each([
		{
			why: "the same zone",
			a: "Europe/Helsinki",
			b: "Europe/Helsinki",
			expected: true,
		},
		{ why: "aliases", a: "Asia/Calcutta", b: "Asia/Kolkata", expected: true },
		{
			why: "neighbours",
			a: "Europe/Berlin",
			b: "Europe/Stockholm",
			expected: true,
		},
		{
			why: "zones apart only in summer",
			a: "Europe/London",
			b: "Africa/Abidjan",
			expected: false,
		},
		{
			why: "zones hours apart",
			a: "Europe/Helsinki",
			b: "America/Chicago",
			expected: false,
		},
	])("$why: $expected", ({ a, b, expected }) => {
		expect(zonesReadSameClock(a, b, FROM)).toBe(expected);
	});
});
