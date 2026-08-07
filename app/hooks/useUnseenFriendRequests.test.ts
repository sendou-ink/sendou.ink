import { describe, it } from "vitest";
import {
	assertDecodesToDefault,
	assertRoundTrips,
} from "~/modules/persisted-state/persisted-state-test-utils";
import { seenFriendRequestsPersisted } from "./useUnseenFriendRequests";

describe("seenFriendRequestsPersisted", () => {
	it("round-trips", () => {
		assertRoundTrips(seenFriendRequestsPersisted, [[], [3, 2, 1]]);
	});

	it("malformed values decode to the default", () => {
		assertDecodesToDefault(seenFriendRequestsPersisted, [
			"not json",
			'{"a":1}',
			'["a"]',
		]);
	});
});
