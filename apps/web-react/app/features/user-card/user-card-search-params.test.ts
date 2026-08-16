import { describe, test } from "vitest";
import {
	assertDecodesToDefault,
	assertRoundTrips,
} from "~/modules/search-params/search-params-test-utils";
import {
	userCardEditSearchParams,
	userCardFriendshipSearchParams,
} from "./user-card-search-params";

describe("userCardEditSearchParams", () => {
	test("round-trips", () => {
		assertRoundTrips(userCardEditSearchParams, {
			returnTo: ["/u/sendou", "/plans?weapon=1"],
		});
	});

	test("unsafe redirect targets decode to default", () => {
		assertDecodesToDefault(userCardEditSearchParams, "returnTo", [
			["https://evil.example"],
			["//evil.example"],
			["evil"],
		]);
	});
});

describe("userCardFriendshipSearchParams", () => {
	test("round-trips", () => {
		assertRoundTrips(userCardFriendshipSearchParams, {
			mutuals: [true, false],
		});
	});

	test("garbage decodes to default", () => {
		assertDecodesToDefault(userCardFriendshipSearchParams, "mutuals", [
			["1"],
			["yes"],
		]);
	});
});
