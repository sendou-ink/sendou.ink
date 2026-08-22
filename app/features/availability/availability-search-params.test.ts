import { describe, test } from "vitest";
import { assertRoundTrips } from "~/modules/search-params/search-params-test-utils";
import { scheduleWeekSearchParams } from "./availability-search-params";

describe("scheduleWeekSearchParams", () => {
	test("round-trips", () => {
		assertRoundTrips(scheduleWeekSearchParams, {
			week: ["current", "next"],
		});
	});
});
