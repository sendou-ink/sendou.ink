import { describe, expect, it } from "vitest";
import { winCounts } from "./sets.server";

describe("winCounts", () => {
	it("returns 0% (not NaN) when there are no played sets", () => {
		const result = winCounts([]);

		expect(result.sets.percentage).toBe(0);
		expect(result.maps.percentage).toBe(0);
	});
});
