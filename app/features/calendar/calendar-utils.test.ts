import { describe, expect, test } from "vitest";
import { calendarEventMaxDate, calendarEventMinDate } from "./calendar-utils";

describe("calendar-utils", () => {
	test("calendarEventMinDate should return a fixed date", () => {
		expect(calendarEventMinDate()).toEqual(new Date(Date.UTC(2015, 4, 28)));
	});

	test("calendarEventMaxDate should return a date one year from now", () => {
		const result = calendarEventMaxDate();
		const expected = new Date();
		expected.setFullYear(expected.getFullYear() + 1);
		expect(result.getFullYear()).toBe(expected.getFullYear());
	});
});
