import { describe, test } from "vitest";
import { assertRoundTrips } from "~/modules/search-params/search-params-test-utils";
import { teamScheduleSearchParams } from "./availability-search-params";

describe("teamScheduleSearchParams", () => {
	test("round-trips", () => {
		assertRoundTrips(teamScheduleSearchParams, {
			week: ["current", "next"],
		});
	});
});
