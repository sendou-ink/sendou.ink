import { describe, it } from "vitest";
import {
	assertDecodesToDefault,
	assertRoundTrips,
} from "~/modules/search-params/search-params-test-utils";
import { plusSuggestionsSearchParams } from "./plus-suggestions-search-params";

describe("plusSuggestionsSearchParams", () => {
	it("round-trips", () => {
		assertRoundTrips(plusSuggestionsSearchParams, {
			tier: [null, "1", "2", "3"],
			alert: [false, true],
			editingSuggestionId: [null, 1, 5312],
		});
	});

	it("malformed values decode to defaults", () => {
		assertDecodesToDefault(plusSuggestionsSearchParams, "tier", [
			["0"],
			["4"],
			["abc"],
		]);
		assertDecodesToDefault(plusSuggestionsSearchParams, "alert", [
			["1"],
			["yes"],
		]);
		assertDecodesToDefault(plusSuggestionsSearchParams, "editingSuggestionId", [
			["0"],
			["-5"],
			["1.5"],
			["abc"],
		]);
	});
});
