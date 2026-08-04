import { describe, it } from "vitest";
import {
	assertDecodesToDefault,
	assertRoundTrips,
} from "~/modules/search-params/search-params-test-utils";
import { globalSearchSearchParams } from "./global-search-search-params";

describe("globalSearchSearchParams", () => {
	it("round-trips", () => {
		assertRoundTrips(globalSearchSearchParams, {
			search: [null, "open"],
			type: [null, "weapons", "users", "teams", "organizations", "tournaments"],
			weapon: [null, 0, 10, 8000],
		});
	});

	it("malformed values decode to defaults", () => {
		assertDecodesToDefault(globalSearchSearchParams, "search", [["closed"]]);
		assertDecodesToDefault(globalSearchSearchParams, "type", [["USER"]]);
		assertDecodesToDefault(globalSearchSearchParams, "weapon", [
			["99999"],
			["abc"],
		]);
	});
});
