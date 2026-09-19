import { describe, test } from "vitest";
import {
	assertDecodesToDefault,
	assertRoundTrips,
} from "~/modules/search-params/search-params-test-utils";
import { scannerSearchParams } from "./scanner-search-params";

describe("scannerSearchParams", () => {
	test("round-trips", () => {
		assertRoundTrips(scannerSearchParams, {
			view: ["home", "live", "session", "vod", "clips", "debug", "fixtures"],
			id: [1758040920000, 0, null],
			name: ["sws26-finals.mkv", "a b.mp4", null],
			q: ["", "gauge-overlay", "player-status/cast,ready-trough"],
			inspect: ["1723456789012-abc123", null],
			telemetry: [true, false],
			debug: [true, false],
		});
	});

	test("malformed values decode to defaults", () => {
		assertDecodesToDefault(scannerSearchParams, "view", [
			["garbage"],
			["LIVE"],
		]);
		assertDecodesToDefault(scannerSearchParams, "id", [["-5"], ["1.5"]]);
	});
});
