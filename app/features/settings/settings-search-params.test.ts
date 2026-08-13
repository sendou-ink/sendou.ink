import { describe, test } from "vitest";
import {
	assertDecodesToDefault,
	assertRoundTrips,
} from "~/modules/search-params/search-params-test-utils";
import { settingsSearchParams } from "./settings-search-params";

describe("settingsSearchParams", () => {
	test("round-trips", () => {
		assertRoundTrips(settingsSearchParams, {
			tab: [null, "preferences", "match-profile", "locale", "theme", "sounds"],
			lng: [null, "en", "fr", "zh-TW"],
		});
	});

	test("malformed values decode to defaults", () => {
		assertDecodesToDefault(settingsSearchParams, "tab", [["garbage"]]);
	});
});
