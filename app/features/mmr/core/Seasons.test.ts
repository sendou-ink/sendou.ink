import { addHours, addMilliseconds, subDays } from "date-fns";
import { describe, expect, test } from "vitest";
import {
	allFinished,
	allStarted,
	current,
	list,
	next,
	nthToDateRange,
	nthToGroupMembershipDateRange,
	nthToReportingDateRange,
	previous,
} from "./Seasons";

const FIRST = list[0];
const SECOND = list[1];
const LAST = list[list.length - 1];

const justBefore = (date: Date) => addMilliseconds(date, -1);
const justAfter = (date: Date) => addMilliseconds(date, 1);

describe("nthToDateRange()", () => {
	test("returns the date range for an existing season", () => {
		const { starts, ends } = nthToDateRange(0);
		expect(starts).toEqual(list[0].starts);
		expect(ends).toEqual(list[0].ends);
	});

	test("throws for a season number past the end of the list", () => {
		expect(() => nthToDateRange(list.length)).toThrow();
	});

	test("throws for a negative season number", () => {
		expect(() => nthToDateRange(-1)).toThrow();
	});
});

describe("nthToReportingDateRange()", () => {
	test("starts when the season starts", () => {
		const { starts } = nthToReportingDateRange(0);
		expect(starts).toEqual(list[0].starts);
	});

	test("ends 25 hours after the season ends, covering matches made at the buzzer", () => {
		const { ends } = nthToReportingDateRange(0);
		expect(ends).toEqual(addHours(list[0].ends, 25));
	});

	test("throws for a season number past the end of the list", () => {
		expect(() => nthToReportingDateRange(list.length)).toThrow();
	});
});

describe("nthToGroupMembershipDateRange()", () => {
	test("starts a week before the season, covering groups formed before it", () => {
		const { starts } = nthToGroupMembershipDateRange(0);
		expect(starts).toEqual(subDays(list[0].starts, 7));
	});

	test("ends when reporting ends", () => {
		const { ends } = nthToGroupMembershipDateRange(0);
		expect(ends).toEqual(nthToReportingDateRange(0).ends);
	});
});

describe("current", () => {
	test.each([
		{
			why: "a season is current from the moment it starts",
			date: SECOND.starts,
			expected: 1,
		},
		{
			why: "a season is current until its last moment",
			date: SECOND.ends,
			expected: 1,
		},
		{
			why: "no season is current right after one ends",
			date: justAfter(FIRST.ends),
			expected: null,
		},
		{
			why: "no season is current right before one starts",
			date: justBefore(SECOND.starts),
			expected: null,
		},
	])("$why", ({ date, expected }) => {
		expect(current(date)?.nth ?? null).toBe(expected);
	});
});

describe("previous", () => {
	test.each([
		{
			why: "a season is not previous at its last moment",
			date: SECOND.ends,
			expected: 0,
		},
		{
			why: "a season is previous right after it ends",
			date: justAfter(SECOND.ends),
			expected: 1,
		},
		{
			why: "nothing is previous before the first season ends",
			date: FIRST.starts,
			expected: null,
		},
	])("$why", ({ date, expected }) => {
		expect(previous(date)?.nth ?? null).toBe(expected);
	});
});

describe("next", () => {
	test.each([
		{
			why: "is the coming season between two seasons",
			date: justAfter(FIRST.ends),
			expected: 1,
		},
		{
			why: "is the following season during a season",
			date: FIRST.starts,
			expected: 1,
		},
		{
			why: "is the first season before any has started",
			date: justBefore(FIRST.starts),
			expected: 0,
		},
		{
			why: "is null during the last season",
			date: LAST.starts,
			expected: null,
		},
	])("$why", ({ date, expected }) => {
		expect(next(date)?.nth ?? null).toBe(expected);
	});
});

describe("allStarted", () => {
	test.each([
		{
			why: "a season counts from the moment it starts",
			date: SECOND.starts,
			expected: [1, 0],
		},
		{
			why: "falls back to the first season before any has started",
			date: justBefore(FIRST.starts),
			expected: [0],
		},
	])("$why", ({ date, expected }) => {
		expect(allStarted(date)).toEqual(expected);
	});
});

describe("allFinished", () => {
	test.each([
		{
			why: "a season isn't finished at its last moment",
			date: SECOND.ends,
			expected: [0],
		},
		{
			why: "a season is finished right after it ends",
			date: justAfter(SECOND.ends),
			expected: [1, 0],
		},
	])("$why", ({ date, expected }) => {
		expect(allFinished(date)).toEqual(expected);
	});
});
