import { describe, test } from "vitest";
import {
	assertDecodesToDefault,
	assertRoundTrips,
} from "~/modules/persisted-state/persisted-state-test-utils";
import { seenFriendRequestsPersisted } from "./useUnseenFriendRequests";

describe("seenFriendRequestsPersisted", () => {
	test("round-trips", () => {
		assertRoundTrips(seenFriendRequestsPersisted, [[], [3, 2, 1]]);
	});

	test("malformed values decode to the default", () => {
		assertDecodesToDefault(seenFriendRequestsPersisted, [
			"not json",
			'{"a":1}',
			'["a"]',
		]);
	});
});
