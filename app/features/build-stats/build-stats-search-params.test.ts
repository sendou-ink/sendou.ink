import { describe, test } from "vitest";
import { RECENT_PATCHES } from "~/features/builds/builds-constants";
import {
	assertDecodesToDefault,
	assertRoundTrips,
} from "~/modules/search-params/search-params-test-utils";
import { ANY_TIME } from "./build-stats-constants";
import { buildStatsSearchParams } from "./build-stats-search-params";

describe("buildStatsSearchParams", () => {
	test("round-trips", () => {
		assertRoundTrips(buildStatsSearchParams, {
			date: [
				null,
				ANY_TIME,
				RECENT_PATCHES[0].date,
				RECENT_PATCHES.at(-1)!.date,
			],
		});
	});

	test("decodes garbage to defaults", () => {
		assertDecodesToDefault(buildStatsSearchParams, "date", [
			["2020-01-01"],
			["yesterday"],
		]);
	});
});
