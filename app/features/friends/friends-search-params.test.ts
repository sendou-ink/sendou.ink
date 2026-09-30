import { describe, test } from "vitest";
import {
	assertDecodesToDefault,
	assertRoundTrips,
} from "~/modules/search-params/search-params-test-utils";
import { friendsSearchParams } from "./friends-search-params";

describe("friendsSearchParams", () => {
	test("round-trips", () => {
		assertRoundTrips(friendsSearchParams, {
			view: [null, "friends", "team", "all"],
		});
	});

	test("malformed values decode to defaults", () => {
		assertDecodesToDefault(friendsSearchParams, "view", [["garbage"]]);
	});
});
