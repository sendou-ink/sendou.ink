import { describe, it } from "vitest";
import {
	assertDecodesToDefault,
	assertRoundTrips,
} from "~/modules/search-params/search-params-test-utils";
import { MapPool } from "./core/map-pool";
import { mapListGeneratorSearchParams } from "./map-list-generator-search-params";

describe("mapListGeneratorSearchParams", () => {
	it("round-trips", () => {
		assertRoundTrips(mapListGeneratorSearchParams, {
			pool: [
				MapPool.ANARCHY.serialized,
				new MapPool({ TW: [], SZ: [1, 2], TC: [3], RM: [], CB: [] }).serialized,
			],
			eventId: [null, 1, 500],
			readonly: [false, true],
		});
	});

	it("decodes garbage to defaults", () => {
		assertDecodesToDefault(mapListGeneratorSearchParams, "eventId", [
			["abc"],
			["-1"],
		]);
	});
});
