import { describe, expect, it } from "vitest";
import { list, nthToDateRange } from "./Seasons";

describe("nthToDateRange()", () => {
	it("returns the date range for an existing season", () => {
		const { starts, ends } = nthToDateRange(0);
		expect(starts).toEqual(list[0].starts);
		expect(ends).toEqual(list[0].ends);
	});

	it("throws for a season number past the end of the list", () => {
		expect(() => nthToDateRange(list.length)).toThrow();
	});

	it("throws for a negative season number", () => {
		expect(() => nthToDateRange(-1)).toThrow();
	});
});
