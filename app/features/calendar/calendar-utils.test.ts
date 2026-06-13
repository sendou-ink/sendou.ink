import { describe, expect, it } from "vitest";
import {
	calendarEventMaxDate,
	calendarEventMinDate,
	datesToRegClosesAt,
	regClosesAtDate,
	regClosesAtToDisplayName,
} from "./calendar-utils";

describe("calendar-utils", () => {
	it("calendarEventMinDate should return a fixed date", () => {
		expect(calendarEventMinDate()).toEqual(new Date(Date.UTC(2015, 4, 28)));
	});

	it("calendarEventMaxDate should return a date one year from now", () => {
		const result = calendarEventMaxDate();
		const expected = new Date();
		expected.setFullYear(expected.getFullYear() + 1);
		expect(result.getFullYear()).toBe(expected.getFullYear());
	});

	it("regClosesAtDate should return correct date based on closesAt option", () => {
		const startTime = new Date();
		expect(regClosesAtDate({ startTime, closesAt: "5min" })).toEqual(
			new Date(startTime.getTime() - 5 * 60 * 1000),
		);
		expect(regClosesAtDate({ startTime, closesAt: "1h" })).toEqual(
			new Date(startTime.getTime() - 60 * 60 * 1000),
		);
	});

	it("regClosesAtToDisplayName should return correct display name", () => {
		expect(regClosesAtToDisplayName("5min")).toBe("5 minutes");
		expect(regClosesAtToDisplayName("1h")).toBe("1 hour");
	});

	it("datesToRegClosesAt should return correct closesAt option based on date difference", () => {
		const startTime = new Date();
		expect(
			datesToRegClosesAt({
				startTime,
				regClosesAt: new Date(startTime.getTime() - 5 * 60 * 1000),
			}),
		).toBe("5min");
		expect(
			datesToRegClosesAt({
				startTime,
				regClosesAt: new Date(startTime.getTime() - 60 * 60 * 1000),
			}),
		).toBe("1h");
	});
});
