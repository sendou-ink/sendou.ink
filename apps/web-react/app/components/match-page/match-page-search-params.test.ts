import { describe, test } from "vitest";
import {
	assertDecodesToDefault,
	assertRoundTrips,
} from "~/modules/search-params/search-params-test-utils";
import { matchPageSearchParams } from "./match-page-search-params";

describe("matchPageSearchParams", () => {
	test("round-trips", () => {
		assertRoundTrips(matchPageSearchParams, {
			tab: [null, "rosters", "action", "result", "stats", "admin"],
		});
	});

	test("malformed values decode to defaults", () => {
		assertDecodesToDefault(matchPageSearchParams, "tab", [["garbage"]]);
	});
});
