import { describe, test } from "vitest";
import {
	assertDecodesToDefault,
	assertRoundTrips,
} from "~/modules/search-params/search-params-test-utils";
import { translateLanguageSearchParams } from "./translate-search-params";

describe("translateLanguageSearchParams", () => {
	test("round-trips", () => {
		assertRoundTrips(translateLanguageSearchParams, {
			page: [1, 2, 100],
			namespace: [null, "common", "tier-list-maker"],
			status: ["untranslated", "translated", "drafts", "all"],
			search: ["", "save", "{{count}} sets"],
		});
	});

	test("malformed values decode to defaults", () => {
		assertDecodesToDefault(translateLanguageSearchParams, "page", [
			["0"],
			["abc"],
		]);
		assertDecodesToDefault(translateLanguageSearchParams, "status", [
			["UNTRANSLATED"],
			["foo"],
		]);
		assertDecodesToDefault(translateLanguageSearchParams, "search", [
			["x".repeat(101)],
		]);
	});
});
