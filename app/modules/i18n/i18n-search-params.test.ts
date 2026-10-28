import { describe, test } from "vitest";
import {
	assertDecodesToDefault,
	assertRoundTrips,
} from "~/modules/search-params/search-params-test-utils";
import { languageSearchParams } from "./i18n-search-params";

describe("languageSearchParams", () => {
	test("round-trips", () => {
		assertRoundTrips(languageSearchParams, {
			lng: [null, "en", "es-US"],
			gameLng: [null, "en", "fr-CA", "ko"],
		});
	});

	test("malformed values decode to defaults", () => {
		assertDecodesToDefault(languageSearchParams, "lng", [["xx"], ["ko"]]);
		assertDecodesToDefault(languageSearchParams, "gameLng", [["pt-BR"]]);
	});
});
