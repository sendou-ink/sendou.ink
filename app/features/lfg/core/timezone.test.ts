import { describe, expect, test } from "vitest";
import {
	hourDifferenceBetweenTimezones,
	timezonesWithinHours,
} from "./timezone";

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
});
