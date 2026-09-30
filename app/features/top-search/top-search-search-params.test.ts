import { describe, test } from "vitest";
import {
	assertDecodesToDefault,
	assertRoundTrips,
} from "~/modules/search-params/search-params-test-utils";
import { topSearchSearchParams } from "./top-search-search-params";

describe("topSearchSearchParams", () => {
	test("round-trips", () => {
		assertRoundTrips(topSearchSearchParams, {
			mode: ["SZ", "TC", "RM", "CB"],
			region: ["WEST", "JPN"],
			month: [null, 1, 6, 12],
			year: [null, 2023, 2026],
		});
	});

	test("malformed values decode to defaults", () => {
		assertDecodesToDefault(topSearchSearchParams, "mode", [
			["TW"],
			["garbage"],
		]);
		assertDecodesToDefault(topSearchSearchParams, "month", [
			["0"],
			["13"],
			["abc"],
		]);
		assertDecodesToDefault(topSearchSearchParams, "year", [["2022"], ["nope"]]);
	});
});
