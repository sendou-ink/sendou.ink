import { describe, it } from "vitest";
import {
	assertDecodesToDefault,
	assertRoundTrips,
} from "~/modules/search-params/search-params-test-utils";
import { cvSearchParams } from "./cv-search-params";

describe("cvSearchParams", () => {
	it("round-trips", () => {
		assertRoundTrips(cvSearchParams, {
			tab: ["live", "screenshot", "vod"],
		});
	});

	it("malformed values decode to defaults", () => {
		assertDecodesToDefault(cvSearchParams, "tab", [["garbage"], ["LIVE"]]);
	});
});
