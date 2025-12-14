import { describe, expect, it } from "vitest";
import { formatFlexTimeDisplay, generateTimeOptions } from "./scrims-utils";

describe("generateTimeOptions", () => {
	it("includes both start and end times", () => {
		const start = new Date("2025-01-15T14:15:00");
		const end = new Date("2025-01-15T16:45:00");

		const result = generateTimeOptions(start, end);

		expect(result).toContain(start.getTime());
		expect(result).toContain(end.getTime());
	});

	it("includes all :00 and :30 times in range", () => {
		const start = new Date("2025-01-15T14:00:00");
		const end = new Date("2025-01-15T16:00:00");

		const result = generateTimeOptions(start, end);

		expect(result).toContain(new Date("2025-01-15T14:00:00").getTime());
		expect(result).toContain(new Date("2025-01-15T14:30:00").getTime());
		expect(result).toContain(new Date("2025-01-15T15:00:00").getTime());
		expect(result).toContain(new Date("2025-01-15T15:30:00").getTime());
		expect(result).toContain(new Date("2025-01-15T16:00:00").getTime());
	});

	it("clears seconds and milliseconds from all times", () => {
		const start = new Date("2025-01-15T14:15:23.456");
		const end = new Date("2025-01-15T15:45:59.999");

		const result = generateTimeOptions(start, end);

		for (const timestamp of result) {
			const date = new Date(timestamp);
			expect(date.getSeconds()).toBe(0);
			expect(date.getMilliseconds()).toBe(0);
		}
	});

	it("returns sorted timestamps", () => {
		const start = new Date("2025-01-15T14:15:00");
		const end = new Date("2025-01-15T16:45:00");

		const result = generateTimeOptions(start, end);

		for (let i = 1; i < result.length; i++) {
			expect(result[i]).toBeGreaterThan(result[i - 1]);
		}
	});

	it("handles start time between :00 and :30", () => {
		const start = new Date("2025-01-15T14:10:00");
		const end = new Date("2025-01-15T15:00:00");

		const result = generateTimeOptions(start, end);

		expect(result).toContain(new Date("2025-01-15T14:10:00").getTime());
		expect(result).toContain(new Date("2025-01-15T14:30:00").getTime());
		expect(result).toContain(new Date("2025-01-15T15:00:00").getTime());
	});

	it("handles start time between :30 and :00", () => {
		const start = new Date("2025-01-15T14:45:00");
		const end = new Date("2025-01-15T16:00:00");

		const result = generateTimeOptions(start, end);

		expect(result).toContain(new Date("2025-01-15T14:45:00").getTime());
		expect(result).toContain(new Date("2025-01-15T15:00:00").getTime());
		expect(result).toContain(new Date("2025-01-15T15:30:00").getTime());
		expect(result).toContain(new Date("2025-01-15T16:00:00").getTime());
	});

	it("handles range less than 30 minutes", () => {
		const start = new Date("2025-01-15T14:15:00");
		const end = new Date("2025-01-15T14:25:00");

		const result = generateTimeOptions(start, end);

		expect(result).toEqual([
			new Date("2025-01-15T14:15:00").getTime(),
			new Date("2025-01-15T14:25:00").getTime(),
		]);
	});

	it("handles exact hour boundaries", () => {
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

	it("handles exact half-hour boundaries", () => {
		const start = new Date("2025-01-15T14:30:00");
		const end = new Date("2025-01-15T16:30:00");

		const result = generateTimeOptions(start, end);

		expect(result).toContain(new Date("2025-01-15T14:30:00").getTime());
		expect(result).toContain(new Date("2025-01-15T15:00:00").getTime());
		expect(result).toContain(new Date("2025-01-15T15:30:00").getTime());
		expect(result).toContain(new Date("2025-01-15T16:00:00").getTime());
		expect(result).toContain(new Date("2025-01-15T16:30:00").getTime());
	});

	it("does not include duplicate times", () => {
		const start = new Date("2025-01-15T14:00:00");
		const end = new Date("2025-01-15T15:00:00");

		const result = generateTimeOptions(start, end);

		const uniqueValues = new Set(result);
		expect(result.length).toBe(uniqueValues.size);
	});

	it("handles maximum 3-hour range", () => {
		const start = new Date("2025-01-15T14:00:00");
		const end = new Date("2025-01-15T17:00:00");

		const result = generateTimeOptions(start, end);

		expect(result.length).toBe(7);
	});
});

describe("formatFlexTimeDisplay", () => {
	it("returns null when totalMinutes is 0", () => {
		const timestamp = Math.floor(
			new Date("2025-01-15T14:00:00").getTime() / 1000,
		);

		const result = formatFlexTimeDisplay(timestamp, timestamp);

		expect(result).toBeNull();
	});

	it("returns null when endTimestamp is before startTimestamp", () => {
		const start = Math.floor(new Date("2025-01-15T14:00:00").getTime() / 1000);
		const end = Math.floor(new Date("2025-01-15T13:00:00").getTime() / 1000);

		const result = formatFlexTimeDisplay(start, end);

		expect(result).toBeNull();
	});

	it("returns formatted minutes when only minutes (no hours)", () => {
		const start = Math.floor(new Date("2025-01-15T14:00:00").getTime() / 1000);
		const end = Math.floor(new Date("2025-01-15T14:45:00").getTime() / 1000);

		const result = formatFlexTimeDisplay(start, end);

		expect(result).toBe("+45m");
	});

	it("returns formatted hours when exactly on the hour", () => {
		const start = Math.floor(new Date("2025-01-15T14:00:00").getTime() / 1000);
		const end = Math.floor(new Date("2025-01-15T16:00:00").getTime() / 1000);

		const result = formatFlexTimeDisplay(start, end);

		expect(result).toBe("+2h");
	});

	it("returns formatted hours and minutes when both present", () => {
		const start = Math.floor(new Date("2025-01-15T14:00:00").getTime() / 1000);
		const end = Math.floor(new Date("2025-01-15T15:30:00").getTime() / 1000);

		const result = formatFlexTimeDisplay(start, end);

		expect(result).toBe("+1h 30m");
	});

	it("handles 1 minute difference", () => {
		const start = Math.floor(new Date("2025-01-15T14:00:00").getTime() / 1000);
		const end = Math.floor(new Date("2025-01-15T14:01:00").getTime() / 1000);

		const result = formatFlexTimeDisplay(start, end);

		expect(result).toBe("+1m");
	});

	it("handles 1 hour difference", () => {
		const start = Math.floor(new Date("2025-01-15T14:00:00").getTime() / 1000);
		const end = Math.floor(new Date("2025-01-15T15:00:00").getTime() / 1000);

		const result = formatFlexTimeDisplay(start, end);

		expect(result).toBe("+1h");
	});

	it("handles multiple hours and minutes", () => {
		const start = Math.floor(new Date("2025-01-15T14:00:00").getTime() / 1000);
		const end = Math.floor(new Date("2025-01-15T17:25:00").getTime() / 1000);

		const result = formatFlexTimeDisplay(start, end);

		expect(result).toBe("+3h 25m");
	});

	it("handles 59 minutes", () => {
		const start = Math.floor(new Date("2025-01-15T14:00:00").getTime() / 1000);
		const end = Math.floor(new Date("2025-01-15T14:59:00").getTime() / 1000);

		const result = formatFlexTimeDisplay(start, end);

		expect(result).toBe("+59m");
	});

	it("handles exactly 60 minutes as 1 hour", () => {
		const start = Math.floor(new Date("2025-01-15T14:00:00").getTime() / 1000);
		const end = Math.floor(new Date("2025-01-15T15:00:00").getTime() / 1000);

		const result = formatFlexTimeDisplay(start, end);

		expect(result).toBe("+1h");
	});

	it("handles 61 minutes as 1 hour 1 minute", () => {
		const start = Math.floor(new Date("2025-01-15T14:00:00").getTime() / 1000);
		const end = Math.floor(new Date("2025-01-15T15:01:00").getTime() / 1000);

		const result = formatFlexTimeDisplay(start, end);

		expect(result).toBe("+1h 1m");
	});
});
