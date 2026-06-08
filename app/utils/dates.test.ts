import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
	getDateAtNextFullHour,
	weekNumberToDate,
	weekNumberToDateRange,
} from "./dates";

describe("getDateAtNextFullHour", () => {
	it("returns a date sitting exactly on a full hour (no leftover minutes/seconds/milliseconds)", () => {
		const result = getDateAtNextFullHour(new Date(2024, 0, 1, 14, 30, 0, 500));

		expect(result).toEqual(new Date(2024, 0, 1, 15, 0, 0, 0));
	});

	it("advances to the next hour when only seconds/milliseconds are past the hour", () => {
		const result = getDateAtNextFullHour(new Date(2024, 0, 1, 14, 0, 30, 0));

		expect(result).toEqual(new Date(2024, 0, 1, 15, 0, 0, 0));
	});

	it("keeps the same hour when already exactly on a full hour", () => {
		const result = getDateAtNextFullHour(new Date(2024, 0, 1, 14, 0, 0, 0));

		expect(result).toEqual(new Date(2024, 0, 1, 14, 0, 0, 0));
	});
});

describe("weekNumberToDate", () => {
	// Force a timezone west of UTC so the assertion is deterministic regardless
	// of where the test happens to run (the bug only manifests west of UTC).
	const originalTimezone = process.env.TZ;
	beforeAll(() => {
		process.env.TZ = "America/Los_Angeles";
	});
	afterAll(() => {
		process.env.TZ = originalTimezone;
	});

	it("returns the Monday of the ISO week regardless of server timezone", () => {
		// ISO week 1 of 2024 starts on Monday 2024-01-01
		const start = weekNumberToDate({ week: 1, year: 2024 });

		expect(start.toISOString().slice(0, 10)).toBe("2024-01-01");
	});

	it("returns the Sunday of the ISO week regardless of server timezone", () => {
		// ISO week 1 of 2024 ends on Sunday 2024-01-07
		const end = weekNumberToDate({ week: 1, year: 2024, position: "end" });

		expect(end.toISOString().slice(0, 10)).toBe("2024-01-07");
	});
});

describe("weekNumberToDateRange", () => {
	// Force a timezone west of UTC observing DST so the assertion is deterministic
	// regardless of where the test happens to run.
	const originalTimezone = process.env.TZ;
	beforeAll(() => {
		process.env.TZ = "America/New_York";
	});
	afterAll(() => {
		process.env.TZ = originalTimezone;
	});

	const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

	it("spans exactly seven days even when the week contains a DST transition", () => {
		// US spring-forward 2025 happened on Sunday 2025-03-09, which falls inside
		// ISO week 10 of 2025 (Mon 2025-03-03 .. Mon 2025-03-10).
		const { startTime, endTime } = weekNumberToDateRange({
			week: 10,
			year: 2025,
		});

		expect(endTime.getTime() - startTime.getTime()).toBe(SEVEN_DAYS_MS);
	});

	it("spans exactly seven days for an ordinary week", () => {
		const { startTime, endTime } = weekNumberToDateRange({
			week: 20,
			year: 2025,
		});

		expect(endTime.getTime() - startTime.getTime()).toBe(SEVEN_DAYS_MS);
	});
});
