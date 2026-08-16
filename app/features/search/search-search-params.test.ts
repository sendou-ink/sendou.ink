import { describe, test } from "vitest";
import {
	assertDecodesToDefault,
	assertRoundTrips,
} from "~/modules/search-params/search-params-test-utils";
import { searchSearchParams } from "./search-search-params";

describe("searchSearchParams", () => {
	test("round-trips", () => {
		assertRoundTrips(searchSearchParams, {
			q: ["", "sendou", "a".repeat(100), "with spaces & specials?"],
			type: ["users", "teams", "organizations", "tournaments"],
			limit: [10, 1, 25],
		});
	});

	test("malformed values decode to defaults", () => {
		assertDecodesToDefault(searchSearchParams, "q", [["a".repeat(101)]]);
		assertDecodesToDefault(searchSearchParams, "type", [["weapons"]]);
		assertDecodesToDefault(searchSearchParams, "limit", [
			["0"],
			["26"],
			["abc"],
		]);
	});
});
