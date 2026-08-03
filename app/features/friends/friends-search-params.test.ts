import { describe, it } from "vitest";
import {
	assertDecodesToDefault,
	assertRoundTrips,
} from "~/modules/search-params/search-params-test-utils";
import { friendsSearchParams } from "./friends-search-params";

describe("friendsSearchParams", () => {
	it("round-trips", () => {
		assertRoundTrips(friendsSearchParams, {
			view: [null, "friends", "team", "all"],
		});
	});

	it("malformed values decode to defaults", () => {
		assertDecodesToDefault(friendsSearchParams, "view", [["garbage"]]);
	});
});
