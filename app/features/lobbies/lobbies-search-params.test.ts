import { describe, test } from "vitest";
import {
	assertDecodesToDefault,
	assertRoundTrips,
} from "~/modules/search-params/search-params-test-utils";
import { lobbiesSearchParams } from "./lobbies-search-params";

describe("lobbiesSearchParams", () => {
	test("round-trips", () => {
		assertRoundTrips(lobbiesSearchParams, {
			tab: [null, "running", "upcoming", "ended"],
		});
	});

	test("malformed values decode to defaults", () => {
		assertDecodesToDefault(lobbiesSearchParams, "tab", [["garbage"]]);
	});
});
