import { describe, it } from "vitest";
import {
	assertDecodesToDefault,
	assertRoundTrips,
} from "~/modules/search-params/search-params-test-utils";
import { settingsSearchParams } from "./settings-search-params";

describe("settingsSearchParams", () => {
	it("round-trips", () => {
		assertRoundTrips(settingsSearchParams, {
			tab: [null, "preferences", "match-profile", "locale", "theme", "sounds"],
			lng: [null, "en", "fr", "zh-TW"],
		});
	});

	it("malformed values decode to defaults", () => {
		assertDecodesToDefault(settingsSearchParams, "tab", [["garbage"]]);
	});
});
