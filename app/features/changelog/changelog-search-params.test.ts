import { describe, test } from "vitest";
import {
	assertDecodesToDefault,
	assertRoundTrips,
} from "~/modules/search-params/search-params-test-utils";
import { changelogSearchParams } from "./changelog-search-params";

describe("changelogSearchParams", () => {
	test("round-trips", () => {
		assertRoundTrips(changelogSearchParams, {
			since: ["317a3a3", "317a3a3f0b6f9e0d1c2b3a4958677889aabbccdd"],
		});
	});

	test("garbage decodes to default", () => {
		assertDecodesToDefault(changelogSearchParams, "since", [
			["not-a-sha"],
			["317a3a"],
			["HEAD~1"],
		]);
	});
});
