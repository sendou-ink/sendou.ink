import * as R from "remeda";
import * as v from "valibot";
import { describe, expect, test } from "vitest";
import { saveWeekSchema } from "./availability-schemas";

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
