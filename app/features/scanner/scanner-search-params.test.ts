import { describe, test } from "vitest";
import {
	assertDecodesToDefault,
	assertRoundTrips,
} from "~/modules/search-params/search-params-test-utils";
import { scannerSearchParams } from "./scanner-search-params";

describe("scannerSearchParams", () => {
	test("round-trips", () => {
		assertRoundTrips(scannerSearchParams, {
			tab: ["live", "screenshot", "vod", "fixtures"],
			q: ["", "gauge-overlay", "player-status/cast,ready-trough"],
			inspect: ["1723456789012-abc123", null],
			telemetry: [true, false],
		});
	});

	test("malformed values decode to defaults", () => {
		assertDecodesToDefault(scannerSearchParams, "tab", [["garbage"], ["LIVE"]]);
	});
});
