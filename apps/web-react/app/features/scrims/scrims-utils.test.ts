import { describe, expect, test } from "vitest";
import { MapPool } from "~/features/map-list-generator/core/map-pool";
import {
	formatFlexTimeDisplay,
	generateTimeOptions,
	parseLutiDivFromName,
	parseMapPoolInput,
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
		const timestamp = Math.floor(
			new Date("2025-01-15T14:00:00").getTime() / 1000,
		);

		const result = formatFlexTimeDisplay(timestamp, timestamp);

		expect(result).toBeNull();
	});

	test("returns null when endTimestamp is before startTimestamp", () => {
		const start = Math.floor(new Date("2025-01-15T14:00:00").getTime() / 1000);
		const end = Math.floor(new Date("2025-01-15T13:00:00").getTime() / 1000);

		const result = formatFlexTimeDisplay(start, end);

		expect(result).toBeNull();
	});

	test("returns formatted minutes when only minutes (no hours)", () => {
		const start = Math.floor(new Date("2025-01-15T14:00:00").getTime() / 1000);
		const end = Math.floor(new Date("2025-01-15T14:45:00").getTime() / 1000);

		const result = formatFlexTimeDisplay(start, end);

		expect(result).toBe("+45m");
	});

	test("returns formatted hours when exactly on the hour", () => {
		const start = Math.floor(new Date("2025-01-15T14:00:00").getTime() / 1000);
		const end = Math.floor(new Date("2025-01-15T16:00:00").getTime() / 1000);

		const result = formatFlexTimeDisplay(start, end);

		expect(result).toBe("+2h");
	});

	test("returns formatted hours and minutes when both present", () => {
		const start = Math.floor(new Date("2025-01-15T14:00:00").getTime() / 1000);
		const end = Math.floor(new Date("2025-01-15T15:30:00").getTime() / 1000);

		const result = formatFlexTimeDisplay(start, end);

		expect(result).toBe("+1h 30m");
	});

	test("handles 1 minute difference", () => {
		const start = Math.floor(new Date("2025-01-15T14:00:00").getTime() / 1000);
		const end = Math.floor(new Date("2025-01-15T14:01:00").getTime() / 1000);

		const result = formatFlexTimeDisplay(start, end);

		expect(result).toBe("+1m");
	});

	test("handles 1 hour difference", () => {
		const start = Math.floor(new Date("2025-01-15T14:00:00").getTime() / 1000);
		const end = Math.floor(new Date("2025-01-15T15:00:00").getTime() / 1000);

		const result = formatFlexTimeDisplay(start, end);

		expect(result).toBe("+1h");
	});

	test("handles multiple hours and minutes", () => {
		const start = Math.floor(new Date("2025-01-15T14:00:00").getTime() / 1000);
		const end = Math.floor(new Date("2025-01-15T17:25:00").getTime() / 1000);

		const result = formatFlexTimeDisplay(start, end);

		expect(result).toBe("+3h 25m");
	});

	test("handles 59 minutes", () => {
		const start = Math.floor(new Date("2025-01-15T14:00:00").getTime() / 1000);
		const end = Math.floor(new Date("2025-01-15T14:59:00").getTime() / 1000);

		const result = formatFlexTimeDisplay(start, end);

		expect(result).toBe("+59m");
	});

	test("handles exactly 60 minutes as 1 hour", () => {
		const start = Math.floor(new Date("2025-01-15T14:00:00").getTime() / 1000);
		const end = Math.floor(new Date("2025-01-15T15:00:00").getTime() / 1000);

		const result = formatFlexTimeDisplay(start, end);

		expect(result).toBe("+1h");
	});

	test("handles 61 minutes as 1 hour 1 minute", () => {
		const start = Math.floor(new Date("2025-01-15T14:00:00").getTime() / 1000);
		const end = Math.floor(new Date("2025-01-15T15:01:00").getTime() / 1000);

		const result = formatFlexTimeDisplay(start, end);

		expect(result).toBe("+1h 1m");
	});
});

describe("parseMapPoolInput", () => {
	const VALID_POOL = "tw:3330000;sz:3a14000;tc:2c98000;rm:2bc0000;cb:39c0000";

	test("returns null for empty string", () => {
		expect(parseMapPoolInput("")).toBeNull();
	});

	test("returns null for whitespace-only string", () => {
		expect(parseMapPoolInput("   \t\n  ")).toBeNull();
	});

	test("returns null when the parsed pool is empty", () => {
		expect(parseMapPoolInput("not-a-valid-pool")).toBeNull();
	});

	test("returns a MapPool for a bare serialized pool", () => {
		const result = parseMapPoolInput(VALID_POOL);

		expect(result).toBeInstanceOf(MapPool);
		expect(result?.serialized).toBe(VALID_POOL);
	});

	test("trims whitespace around a bare serialized pool", () => {
		const result = parseMapPoolInput(`  ${VALID_POOL}  `);

		expect(result?.serialized).toBe(VALID_POOL);
	});

	test("extracts the pool param from a full URL", () => {
		const result = parseMapPoolInput(
			`https://sendou.ink/maps?pool=${VALID_POOL}`,
		);

		expect(result?.serialized).toBe(VALID_POOL);
	});

	test("returns null for a URL without a pool param", () => {
		expect(parseMapPoolInput("https://sendou.ink/maps?other=1")).toBeNull();
	});

	test("ignores other URL params when extracting pool", () => {
		const result = parseMapPoolInput(
			`https://sendou.ink/maps?foo=bar&pool=${VALID_POOL}&baz=qux`,
		);

		expect(result?.serialized).toBe(VALID_POOL);
	});

	test("returns null for a malformed URL with ://", () => {
		expect(parseMapPoolInput("not a url://")).toBeNull();
	});

	test("parses the pool value from a query-string fragment", () => {
		expect(parseMapPoolInput(`pool=${VALID_POOL}`)?.serialized).toBe(
			VALID_POOL,
		);
	});

	test("stops at the next & in a query-string fragment", () => {
		expect(parseMapPoolInput(`pool=${VALID_POOL}&other=1`)?.serialized).toBe(
			VALID_POOL,
		);
	});

	test("preserves leading params before pool= in a query-string fragment", () => {
		expect(parseMapPoolInput(`foo=bar&pool=${VALID_POOL}`)?.serialized).toBe(
			VALID_POOL,
		);
	});
});
