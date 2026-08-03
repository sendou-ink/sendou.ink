import { describe, it } from "vitest";
import {
	assertDecodesToDefault,
	assertRoundTrips,
} from "~/modules/search-params/search-params-test-utils";
import { matchPageSearchParams } from "./match-page-search-params";

describe("matchPageSearchParams", () => {
	it("round-trips", () => {
		assertRoundTrips(matchPageSearchParams, {
			tab: [null, "rosters", "action", "result", "stats", "admin"],
		});
	});

	it("malformed values decode to defaults", () => {
		assertDecodesToDefault(matchPageSearchParams, "tab", [["garbage"]]);
	});
});
