import { describe, test } from "vitest";
import {
	assertDecodesToDefault,
	assertRoundTrips,
} from "~/modules/search-params/search-params-test-utils";
import { feedSearchParams } from "./feed-search-params";

describe("feedSearchParams", () => {
	test("round-trips", () => {
		assertRoundTrips(feedSearchParams, {
			tab: [null, "FRIENDS", "SENDOUQ"],
			viewAs: [null, 1, 274],
			test: [false, true],
			sharedBy: [null, 274],
			token: [null, "abc-_123"],
		});
	});

	test("malformed values decode to defaults", () => {
		assertDecodesToDefault(feedSearchParams, "viewAs", [
			["garbage"],
			["0"],
			["1.5"],
		]);
		assertDecodesToDefault(feedSearchParams, "sharedBy", [["-1"]]);
		assertDecodesToDefault(feedSearchParams, "tab", [["ALL"], ["garbage"]]);
	});
});
