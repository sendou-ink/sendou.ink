import { describe, expect, it } from "vitest";
import {
	assertDecodesToDefault,
	assertRoundTrips,
} from "~/modules/search-params/search-params-test-utils";
import * as Scrim from "./core/Scrim";
import { scrimsSearchParams } from "./scrims-search-params";

describe("scrimsSearchParams", () => {
	it("round-trips", () => {
		// divs examples are in the normalized shape the divsSchema transform
		// produces (max is the higher div) so decode(encode(x)) equals x
		assertRoundTrips(scrimsSearchParams, {
			filters: [
				Scrim.defaultFilters(),
				{
					weekdayTimes: { start: "18:00", end: "22:30" },
					weekendTimes: { start: "10:00", end: "23:59" },
					divs: { min: "5", max: "1" },
				},
				{
					weekdayTimes: null,
					weekendTimes: { start: "00:00", end: "12:00" },
					divs: { min: "3", max: "3" },
				},
				{
					weekdayTimes: null,
					weekendTimes: null,
					divs: { min: "11", max: "X" },
				},
				{
					weekdayTimes: { start: "20:00", end: "02:00" },
					weekendTimes: null,
					divs: { min: null, max: null },
				},
			],
			pendingRequestPostId: [null, 1, 987654],
		});
	});

	it("decodes garbage to defaults", () => {
		assertDecodesToDefault(scrimsSearchParams, "filters", [
			["not-json"],
			["[]"],
			['{"divs":{"min":"1","max":null}}'],
			['{"weekdayTimes":{"start":"25:00","end":"22:00"}}'],
		]);
		assertDecodesToDefault(scrimsSearchParams, "pendingRequestPostId", [
			["abc"],
			["0"],
			["-2"],
			["1.5"],
		]);
	});

	it("keeps valid fields when part of the filters blob is invalid", () => {
		const parsed = scrimsSearchParams.parse(
			new URL(
				`http://localhost/scrims?filters=${encodeURIComponent(
					JSON.stringify({
						weekdayTimes: { start: "18:00", end: "20:00" },
						divs: "bad",
					}),
				)}`,
			),
		);

		expect(parsed.filters).toEqual({
			weekdayTimes: { start: "18:00", end: "20:00" },
			weekendTimes: null,
			divs: null,
		});
	});
});
