import { describe, test } from "vitest";
import {
	assertDecodesToDefault,
	assertRoundTrips,
} from "~/modules/search-params/search-params-test-utils";
import { weaponLandingSearchParams } from "./weapon-landing-search-params";

describe("weaponLandingSearchParams", () => {
	test("round-trips", () => {
		assertRoundTrips(weaponLandingSearchParams, {
			category: [null, "SHOOTERS", "CHARGERS", "SPLATANAS", "SUBS", "SPECIALS"],
		});
	});

	test("decodes garbage to defaults", () => {
		assertDecodesToDefault(weaponLandingSearchParams, "category", [
			["chargers"],
			["SUBWEAPONS"],
		]);
	});
});
