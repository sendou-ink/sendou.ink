import { describe, it } from "vitest";
import {
	assertDecodesToDefault,
	assertRoundTrips,
} from "~/modules/search-params/search-params-test-utils";
import { scannerSearchParams } from "./scanner-search-params";

describe("scannerSearchParams", () => {
	it("round-trips", () => {
		assertRoundTrips(scannerSearchParams, {
			tab: ["live", "screenshot", "vod"],
		});
	});

	it("malformed values decode to defaults", () => {
		assertDecodesToDefault(scannerSearchParams, "tab", [["garbage"], ["LIVE"]]);
	});
});
