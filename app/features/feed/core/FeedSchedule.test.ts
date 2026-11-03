import { describe, expect, test } from "vitest";
import * as FeedSchedule from "./FeedSchedule";

describe("FeedSchedule.latestWeekly", () => {
	test.each([
		{
			why: "later the same weekday",
			now: "2026-11-02T12:00:00Z",
			expected: "2026-11-02T08:00:00.000Z",
		},
		{
			why: "earlier the same weekday",
			now: "2026-11-02T07:00:00Z",
			expected: "2026-10-26T08:00:00.000Z",
		},
		{
			why: "exactly at the moment",
			now: "2026-11-02T08:00:00Z",
			expected: "2026-11-02T08:00:00.000Z",
		},
		{
			why: "later in the week",
			now: "2026-11-05T20:00:00Z",
			expected: "2026-11-02T08:00:00.000Z",
		},
	])("Monday 08:00, $why", ({ now, expected }) => {
		expect(
			FeedSchedule.latestWeekly(new Date(now), {
				weekday: FeedSchedule.WEEKDAY.MONDAY,
			}).toISOString(),
		).toBe(expected);
	});
});

describe("FeedSchedule.showcaseWindow", () => {
	test.each([
		{ why: "Tuesday", now: "2026-11-03T12:00:00Z", kind: "WEEKDAYS" },
		{
			why: "Friday before the post",
			now: "2026-11-06T07:00:00Z",
			kind: "WEEKDAYS",
		},
		{
			why: "Friday after the post",
			now: "2026-11-06T09:00:00Z",
			kind: "WEEKEND",
		},
		{ why: "Sunday", now: "2026-11-08T22:00:00Z", kind: "WEEKEND" },
		{
			why: "Monday before the post",
			now: "2026-11-09T07:00:00Z",
			kind: "WEEKEND",
		},
	])("$why is $kind", ({ now, kind }) => {
		expect(FeedSchedule.showcaseWindow(new Date(now)).kind).toBe(kind);
	});

	test("weekend window ends on Monday's post", () => {
		const window = FeedSchedule.showcaseWindow(
			new Date("2026-11-07T12:00:00Z"),
		);

		expect(window.endsAt.toISOString()).toBe("2026-11-09T08:00:00.000Z");
	});
});

describe("FeedSchedule.latestAnniversary", () => {
	test.each([
		{
			why: "just after the second",
			createdAt: "2024-10-30T15:00:00Z",
			now: "2026-11-01T00:00:00Z",
			expected: { at: "2026-10-30T15:00:00.000Z", years: 2 },
		},
		{
			why: "just before the second",
			createdAt: "2024-11-03T15:00:00Z",
			now: "2026-11-01T00:00:00Z",
			expected: { at: "2025-11-03T15:00:00.000Z", years: 1 },
		},
		{
			why: "before the first",
			createdAt: "2026-01-01T00:00:00Z",
			now: "2026-11-01T00:00:00Z",
			expected: null,
		},
	])("$why", ({ createdAt, now, expected }) => {
		const anniversary = FeedSchedule.latestAnniversary(
			new Date(createdAt),
			new Date(now),
		);

		expect(
			anniversary
				? { at: anniversary.at.toISOString(), years: anniversary.years }
				: null,
		).toEqual(expected);
	});
});

describe("FeedSchedule.reachedMilestone", () => {
	test.each([
		{ why: "below the minimum", count: 999, expected: null },
		{ why: "exactly the minimum", count: 1000, expected: 1000 },
		{ why: "between 2x and 5x", count: 3917, expected: 2000 },
		{ why: "between 5x and the next power", count: 62_358, expected: 50_000 },
		{ why: "a power of ten", count: 118_065, expected: 100_000 },
	])("$why", ({ count, expected }) => {
		expect(FeedSchedule.reachedMilestone(count, 1000)).toBe(expected);
	});
});
