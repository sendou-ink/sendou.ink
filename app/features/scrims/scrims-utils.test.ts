import { describe, expect, test } from "vitest";
import { dateToDatabaseTimestamp } from "~/utils/dates";
import {
	formatFlexTimeDisplay,
	generateTimeOptions,
	parseLutiDivFromName,
	parseLutiSeasonFromName,
	postSpan,
	requestStarts,
} from "./scrims-utils";

describe("parseLutiDivFromName", () => {
	test.each([
		["LUTI: Season 15 - Division 2", "2"],
		["LUTI Season 15 Division X", "X"],
		// a two-digit division must not be read as its leading single digit
		["LUTI Season 15 Div 10", "10"],
		["Leagues Under The Ink Season 15", null],
		["LUTI Division 12", null],
	])("parses %s as %s", (name, expected) => {
		expect(parseLutiDivFromName(name)).toBe(expected);
	});
});

describe("parseLutiSeasonFromName", () => {
	test.each([
		["LUTI: Season 15 - Division 2", 15],
		["LUTI Season 17", 17],
		["LUTI season 9 Div X", 9],
		["LUTI Division 2", null],
		["Seasonal Cup 3", null],
	])("parses %s as %s", (name, expected) => {
		expect(parseLutiSeasonFromName(name)).toBe(expected);
	});
});

describe("generateTimeOptions", () => {
	test("includes both start and end times", () => {
		const start = new Date("2025-01-15T14:15:00");
		const end = new Date("2025-01-15T16:45:00");

		const result = generateTimeOptions(start, end);

		expect(result).toContain(start.getTime());
		expect(result).toContain(end.getTime());
	});

	test("includes all :00 and :30 times in range", () => {
		const start = new Date("2025-01-15T14:00:00");
		const end = new Date("2025-01-15T16:00:00");

		const result = generateTimeOptions(start, end);

		expect(result).toContain(new Date("2025-01-15T14:00:00").getTime());
		expect(result).toContain(new Date("2025-01-15T14:30:00").getTime());
		expect(result).toContain(new Date("2025-01-15T15:00:00").getTime());
		expect(result).toContain(new Date("2025-01-15T15:30:00").getTime());
		expect(result).toContain(new Date("2025-01-15T16:00:00").getTime());
	});

	test("clears seconds and milliseconds from all times", () => {
		const start = new Date("2025-01-15T14:15:23.456");
		const end = new Date("2025-01-15T15:45:59.999");

		const result = generateTimeOptions(start, end);

		for (const timestamp of result) {
			const date = new Date(timestamp);
			expect(date.getSeconds()).toBe(0);
			expect(date.getMilliseconds()).toBe(0);
		}
	});

	test("returns sorted timestamps", () => {
		const start = new Date("2025-01-15T14:15:00");
		const end = new Date("2025-01-15T16:45:00");

		const result = generateTimeOptions(start, end);

		for (let i = 1; i < result.length; i++) {
			expect(result[i]).toBeGreaterThan(result[i - 1]);
		}
	});

	test("handles start time between :00 and :30", () => {
		const start = new Date("2025-01-15T14:10:00");
		const end = new Date("2025-01-15T15:00:00");

		const result = generateTimeOptions(start, end);

		expect(result).toContain(new Date("2025-01-15T14:10:00").getTime());
		expect(result).toContain(new Date("2025-01-15T14:30:00").getTime());
		expect(result).toContain(new Date("2025-01-15T15:00:00").getTime());
	});

	test("handles start time between :30 and :00", () => {
		const start = new Date("2025-01-15T14:45:00");
		const end = new Date("2025-01-15T16:00:00");

		const result = generateTimeOptions(start, end);

		expect(result).toContain(new Date("2025-01-15T14:45:00").getTime());
		expect(result).toContain(new Date("2025-01-15T15:00:00").getTime());
		expect(result).toContain(new Date("2025-01-15T15:30:00").getTime());
		expect(result).toContain(new Date("2025-01-15T16:00:00").getTime());
	});

	test("handles range less than 30 minutes", () => {
		const start = new Date("2025-01-15T14:15:00");
		const end = new Date("2025-01-15T14:25:00");

		const result = generateTimeOptions(start, end);

		expect(result).toEqual([
			new Date("2025-01-15T14:15:00").getTime(),
			new Date("2025-01-15T14:25:00").getTime(),
		]);
	});

	test("handles exact hour boundaries", () => {
		const start = new Date("2025-01-15T14:00:00");
		const end = new Date("2025-01-15T17:00:00");

		const result = generateTimeOptions(start, end);

		expect(result).toContain(new Date("2025-01-15T14:00:00").getTime());
		expect(result).toContain(new Date("2025-01-15T14:30:00").getTime());
		expect(result).toContain(new Date("2025-01-15T15:00:00").getTime());
		expect(result).toContain(new Date("2025-01-15T15:30:00").getTime());
		expect(result).toContain(new Date("2025-01-15T16:00:00").getTime());
		expect(result).toContain(new Date("2025-01-15T16:30:00").getTime());
		expect(result).toContain(new Date("2025-01-15T17:00:00").getTime());
	});

	test("handles exact half-hour boundaries", () => {
		const start = new Date("2025-01-15T14:30:00");
		const end = new Date("2025-01-15T16:30:00");

		const result = generateTimeOptions(start, end);

		expect(result).toContain(new Date("2025-01-15T14:30:00").getTime());
		expect(result).toContain(new Date("2025-01-15T15:00:00").getTime());
		expect(result).toContain(new Date("2025-01-15T15:30:00").getTime());
		expect(result).toContain(new Date("2025-01-15T16:00:00").getTime());
		expect(result).toContain(new Date("2025-01-15T16:30:00").getTime());
	});

	test("does not include duplicate times", () => {
		const start = new Date("2025-01-15T14:00:00");
		const end = new Date("2025-01-15T15:00:00");

		const result = generateTimeOptions(start, end);

		const uniqueValues = new Set(result);
		expect(result.length).toBe(uniqueValues.size);
	});

	test("handles maximum 3-hour range", () => {
		const start = new Date("2025-01-15T14:00:00");
		const end = new Date("2025-01-15T17:00:00");

		const result = generateTimeOptions(start, end);

		expect(result.length).toBe(7);
	});
});

describe("formatFlexTimeDisplay", () => {
	test("returns null when totalMinutes is 0", () => {
		const timestamp = dateToDatabaseTimestamp(new Date("2025-01-15T14:00:00"));

		const result = formatFlexTimeDisplay(timestamp, timestamp);

		expect(result).toBeNull();
	});

	test("returns null when endTimestamp is before startTimestamp", () => {
		const start = dateToDatabaseTimestamp(new Date("2025-01-15T14:00:00"));
		const end = dateToDatabaseTimestamp(new Date("2025-01-15T13:00:00"));

		const result = formatFlexTimeDisplay(start, end);

		expect(result).toBeNull();
	});

	test("returns formatted minutes when only minutes (no hours)", () => {
		const start = dateToDatabaseTimestamp(new Date("2025-01-15T14:00:00"));
		const end = dateToDatabaseTimestamp(new Date("2025-01-15T14:45:00"));

		const result = formatFlexTimeDisplay(start, end);

		expect(result).toBe("+45m");
	});

	test("returns formatted hours when exactly on the hour", () => {
		const start = dateToDatabaseTimestamp(new Date("2025-01-15T14:00:00"));
		const end = dateToDatabaseTimestamp(new Date("2025-01-15T16:00:00"));

		const result = formatFlexTimeDisplay(start, end);

		expect(result).toBe("+2h");
	});

	test("returns formatted hours and minutes when both present", () => {
		const start = dateToDatabaseTimestamp(new Date("2025-01-15T14:00:00"));
		const end = dateToDatabaseTimestamp(new Date("2025-01-15T15:30:00"));

		const result = formatFlexTimeDisplay(start, end);

		expect(result).toBe("+1h 30m");
	});

	test("handles 1 minute difference", () => {
		const start = dateToDatabaseTimestamp(new Date("2025-01-15T14:00:00"));
		const end = dateToDatabaseTimestamp(new Date("2025-01-15T14:01:00"));

		const result = formatFlexTimeDisplay(start, end);

		expect(result).toBe("+1m");
	});

	test("handles 1 hour difference", () => {
		const start = dateToDatabaseTimestamp(new Date("2025-01-15T14:00:00"));
		const end = dateToDatabaseTimestamp(new Date("2025-01-15T15:00:00"));

		const result = formatFlexTimeDisplay(start, end);

		expect(result).toBe("+1h");
	});

	test("handles multiple hours and minutes", () => {
		const start = dateToDatabaseTimestamp(new Date("2025-01-15T14:00:00"));
		const end = dateToDatabaseTimestamp(new Date("2025-01-15T17:25:00"));

		const result = formatFlexTimeDisplay(start, end);

		expect(result).toBe("+3h 25m");
	});

	test("handles 59 minutes", () => {
		const start = dateToDatabaseTimestamp(new Date("2025-01-15T14:00:00"));
		const end = dateToDatabaseTimestamp(new Date("2025-01-15T14:59:00"));

		const result = formatFlexTimeDisplay(start, end);

		expect(result).toBe("+59m");
	});

	test("handles exactly 60 minutes as 1 hour", () => {
		const start = dateToDatabaseTimestamp(new Date("2025-01-15T14:00:00"));
		const end = dateToDatabaseTimestamp(new Date("2025-01-15T15:00:00"));

		const result = formatFlexTimeDisplay(start, end);

		expect(result).toBe("+1h");
	});

	test("handles 61 minutes as 1 hour 1 minute", () => {
		const start = dateToDatabaseTimestamp(new Date("2025-01-15T14:00:00"));
		const end = dateToDatabaseTimestamp(new Date("2025-01-15T15:01:00"));

		const result = formatFlexTimeDisplay(start, end);

		expect(result).toBe("+1h 1m");
	});
});

describe("requestStarts", () => {
	const at = (time: string) =>
		dateToDatabaseTimestamp(new Date(`2025-01-15T${time}:00`));
	const post = { startsAt: at("19:00"), rangeEndsAt: at("20:30") };

	test("offers every half hour of the post's flexibility", () => {
		expect(requestStarts({ post, now: at("12:00") })).toEqual([
			at("19:00"),
			at("19:30"),
			at("20:00"),
			at("20:30"),
		]);
	});

	test("drops the starts already gone by", () => {
		expect(requestStarts({ post, now: at("19:45") })).toEqual([
			at("20:00"),
			at("20:30"),
		]);
	});

	test("offers now for a post with no flexibility", () => {
		expect(
			requestStarts({
				post: { startsAt: at("18:00"), rangeEndsAt: null },
				now: at("19:00"),
			}),
		).toEqual([at("19:00")]);
	});

	test("offers now once the whole flexibility has passed", () => {
		expect(requestStarts({ post, now: at("21:00") })).toEqual([at("21:00")]);
	});
});

describe("postSpan", () => {
	const at = (time: string) =>
		dateToDatabaseTimestamp(new Date(`2025-01-15T${time}:00`));

	test("reaches from the earliest start to the end of a scrim from the latest", () => {
		expect(
			postSpan({
				post: { startsAt: at("19:00"), rangeEndsAt: at("20:30") },
				now: at("12:00"),
			}),
		).toEqual({ startsAt: at("19:00"), endsAt: at("22:00") });
	});
});
