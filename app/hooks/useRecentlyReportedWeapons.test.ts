import { describe, it } from "vitest";
import {
	assertDecodesToDefault,
	assertRoundTrips,
} from "~/modules/persisted-state/persisted-state-test-utils";
import { recentlyReportedWeaponsPersisted } from "./useRecentlyReportedWeapons";

describe("recentlyReportedWeaponsPersisted", () => {
	it("round-trips", () => {
		assertRoundTrips(recentlyReportedWeaponsPersisted, [[], [0, 10, 8000]]);
	});

	it("malformed values decode to the default", () => {
		assertDecodesToDefault(recentlyReportedWeaponsPersisted, [
			"not json",
			"[99999]",
			'["0"]',
		]);
	});
});
