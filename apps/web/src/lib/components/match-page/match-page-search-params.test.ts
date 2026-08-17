import { describe, expect, test } from "vitest";
import { assertRoundTrips } from "#lib/modules/search-params/search-params-test-utils.ts";
import { matchPageSearchParams } from "./match-page-search-params.ts";

describe("matchPageSearchParams", () => {
	test("round-trips representative values", () => {
		assertRoundTrips(matchPageSearchParams, {
			tab: [null, "rosters", "action", "result", "stats", "admin"],
		});
	});

	test("decodes garbage to defaults", () => {
		const parsed = matchPageSearchParams.parse(
			new URLSearchParams("tab=nonsense"),
		);

		expect(parsed).toEqual({ tab: null });
	});
});
