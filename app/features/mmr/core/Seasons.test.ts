import { addHours } from "date-fns";
import { describe, expect, test } from "vitest";
import { list, nthToDateRange, nthToReportingDateRange } from "./Seasons";

describe("nthToDateRange()", () => {
	test("returns the date range for an existing season", () => {
		const { starts, ends } = nthToDateRange(0);
		expect(starts).toEqual(list[0].starts);
		expect(ends).toEqual(list[0].ends);
	});

	test("throws for a season number past the end of the list", () => {
		expect(() => nthToDateRange(list.length)).toThrow();
	});

	test("throws for a negative season number", () => {
		expect(() => nthToDateRange(-1)).toThrow();
	});
});

describe("nthToReportingDateRange()", () => {
	test("starts when the season starts", () => {
		const { starts } = nthToReportingDateRange(0);
		expect(starts).toEqual(list[0].starts);
	});

	test("ends 25 hours after the season ends, covering matches made at the buzzer", () => {
		const { ends } = nthToReportingDateRange(0);
		expect(ends).toEqual(addHours(list[0].ends, 25));
	});

	test("throws for a season number past the end of the list", () => {
		expect(() => nthToReportingDateRange(list.length)).toThrow();
	});
});
