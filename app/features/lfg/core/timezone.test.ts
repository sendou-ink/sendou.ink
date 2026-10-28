import { afterEach, describe, expect, test, vi } from "vitest";
import {
	hourDifferenceBetweenTimezones,
	timezonesWithinHours,
} from "./timezone";

afterEach(() => {
	vi.useRealTimers();
});

describe("hourDifferenceBetweenTimezones", () => {
	// Pacific/Kiritimati is UTC+14 and Pacific/Honolulu is UTC-10, neither
	// observes DST -> their local clocks show the exact same time year round
	test("timezones with identical local clock time across the date line have zero difference", () => {
		expect(
			hourDifferenceBetweenTimezones("Pacific/Kiritimati", "Pacific/Honolulu"),
		).toBe(0);
	});

	// Asia/Tokyo (UTC+9) and Pacific/Honolulu (UTC-10) are 19 hours apart on
	// paper but their local clocks only differ by 5 hours
	test("difference is never more than 12 hours in either direction", () => {
		expect(
			Math.abs(
				hourDifferenceBetweenTimezones("Asia/Tokyo", "Pacific/Honolulu"),
			),
		).toBeLessThanOrEqual(12);
	});

	// Australia/Adelaide (UTC+9:30) moves its clocks forward at 02:00 local time,
	// which is 16:30 UTC, i.e. in the middle of a UTC hour
	test("picks up a DST change that happens on a half hour in UTC", () => {
		vi.useFakeTimers({ toFake: ["Date"] });

		vi.setSystemTime(new Date("2025-10-04T16:10:00Z"));
		expect(
			Math.abs(hourDifferenceBetweenTimezones("Australia/Adelaide", "UTC")),
		).toBe(9.5);

		vi.setSystemTime(new Date("2025-10-04T16:45:00Z"));
		expect(
			Math.abs(hourDifferenceBetweenTimezones("Australia/Adelaide", "UTC")),
		).toBe(10.5);
	});
});

describe("timezonesWithinHours", () => {
	test("includes a timezone across the date line when local clock times match", () => {
		expect(timezonesWithinHours("Pacific/Honolulu", 0)).toContain(
			"Pacific/Kiritimati",
		);
	});

	test("leaves out timezones further away than the limit", () => {
		const timezones = timezonesWithinHours("Europe/Helsinki", 1);

		expect(timezones).toContain("Europe/Berlin");
		expect(timezones).not.toContain("Asia/Tokyo");
	});

	test("keeps a timezone half an hour away within a one hour filter right after its DST change", () => {
		vi.useFakeTimers({ toFake: ["Date"] });

		vi.setSystemTime(new Date("2026-10-03T16:10:00Z"));
		timezonesWithinHours("Australia/Melbourne", 1);

		// Adelaide 03:15, Melbourne 03:45
		vi.setSystemTime(new Date("2026-10-03T16:45:00Z"));
		expect(timezonesWithinHours("Australia/Melbourne", 1)).toContain(
			"Australia/Adelaide",
		);
	});
});
