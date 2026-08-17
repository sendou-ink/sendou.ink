import { describe, expect, test } from "vitest";
import { assertRoundTrips } from "#lib/modules/search-params/search-params-test-utils.ts";
import { scrimsSearchParams } from "./scrims-search-params.ts";

describe("scrimsSearchParams", () => {
	test("round-trips representative values", () => {
		assertRoundTrips(scrimsSearchParams, {
			weekdayTimes: [null, { start: "18:00", end: "21:30" }],
			weekendTimes: [null, { start: "10:00", end: "23:00" }],
			divs: [null, { max: "X", min: "5" }, { max: "1", min: "1" }],
			useDefaults: [true, false],
			pendingRequestPostId: [null, 123],
		});
	});

	test("decodes garbage to defaults", () => {
		const parsed = scrimsSearchParams.parse(
			new URLSearchParams(
				"weekdayTimes=garbage&weekendTimes=25:00-99:99&divs=NOPE-NAH&useDefaults=maybe&pendingRequestPostId=x",
			),
		);

		expect(parsed).toEqual({
			weekdayTimes: null,
			weekendTimes: null,
			divs: null,
			useDefaults: true,
			pendingRequestPostId: null,
		});
	});

	test("divs decode normalizes so max is the stronger div", () => {
		const parsed = scrimsSearchParams.parse(
			new URLSearchParams("divs=5-2"),
		);

		expect(parsed.divs).toEqual({ max: "2", min: "5" });
	});
});
