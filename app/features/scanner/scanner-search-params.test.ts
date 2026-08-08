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
			inspect: ["1723456789012-abc123", null],
			telemetry: [true, false],
		});
	});

	it("malformed values decode to defaults", () => {
		assertDecodesToDefault(scannerSearchParams, "tab", [["garbage"], ["LIVE"]]);
	});
});
