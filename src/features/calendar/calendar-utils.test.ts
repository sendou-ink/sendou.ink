import { describe, expect, it } from "vitest";
import {
	calendarEventMaxDate,
	calendarEventMinDate,
	closeByWeeks,
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

	it("closeByWeeks should return correct week numbers and years (middle of year)", () => {
		const result = closeByWeeks({ week: 24, year: 2024 });
		expect(result).toEqual([
			{ number: 20, year: 2024 },
			{ number: 21, year: 2024 },
			{ number: 22, year: 2024 },
			{ number: 23, year: 2024 },
			{ number: 24, year: 2024 }, // <--
			{ number: 25, year: 2024 },
			{ number: 26, year: 2024 },
			{ number: 27, year: 2024 },
			{ number: 28, year: 2024 },
		]);
	});

	it("closeByWeeks should return correct week numbers and years (start of year)", () => {
		const result = closeByWeeks({ week: 1, year: 2023 });
		expect(result).toEqual([
			{ number: 49, year: 2022 },
			{ number: 50, year: 2022 },
			{ number: 51, year: 2022 },
			{ number: 52, year: 2022 },
			{ number: 1, year: 2023 }, // <--
			{ number: 2, year: 2023 },
			{ number: 3, year: 2023 },
			{ number: 4, year: 2023 },
			{ number: 5, year: 2023 },
		]);
	});

	it("closeByWeeks should return correct week numbers and years (end of year)", () => {
		const result = closeByWeeks({ week: 52, year: 2024 });
		expect(result).toEqual([
			{ number: 48, year: 2024 },
			{ number: 49, year: 2024 },
			{ number: 50, year: 2024 },
			{ number: 51, year: 2024 },
			{ number: 52, year: 2024 }, // <--
			{ number: 1, year: 2025 },
			{ number: 2, year: 2025 },
			{ number: 3, year: 2025 },
			{ number: 4, year: 2025 },
		]);
	});

	it("closeByWeeks should throw if week is out of range", () => {
		expect(() => closeByWeeks({ week: 53, year: 2024 })).toThrow();
	});
});
