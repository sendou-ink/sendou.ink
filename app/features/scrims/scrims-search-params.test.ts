import { describe, test } from "vitest";
import {
	assertDecodesToDefault,
	assertRoundTrips,
} from "~/modules/search-params/search-params-test-utils";
import { scrimsSearchParams } from "./scrims-search-params";

describe("scrimsSearchParams", () => {
	test("round-trips", () => {
		// divs examples are in the normalized shape the divsSchema transform
		// produces (max is the higher div) so decode(encode(x)) equals x
		assertRoundTrips(scrimsSearchParams, {
			weekdayTimes: [
				null,
				{ start: "18:00", end: "22:30" },
				{ start: "00:00", end: "23:59" },
				{ start: "20:00", end: "02:00" },
			],
			weekendTimes: [null, { start: "10:00", end: "23:59" }],
			divs: [
				null,
				{ min: "5", max: "1" },
				{ min: "3", max: "3" },
				{ min: "11", max: "X" },
			],
			pendingRequestPostId: [null, 1, 987654],
			useDefaults: [true, false],
		});
	});

	test("decodes garbage to defaults", () => {
		assertDecodesToDefault(scrimsSearchParams, "weekdayTimes", [
			["25:00-22:00"],
			["18:00x22:00"],
			["18:00"],
			[""],
			["18:60-22:00"],
		]);
		assertDecodesToDefault(scrimsSearchParams, "divs", [
			["1-"],
			["-5"],
			["not-a-div-XX"],
			["12-13"],
			[""],
		]);
		assertDecodesToDefault(scrimsSearchParams, "pendingRequestPostId", [
			["abc"],
			["0"],
			["-2"],
			["1.5"],
		]);
	});
});
