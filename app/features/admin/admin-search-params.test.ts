import { describe, test } from "vitest";
import {
	assertDecodesToDefault,
	assertRoundTrips,
} from "~/modules/search-params/search-params-test-utils";
import { adminSearchParams } from "./admin-search-params";

describe("adminSearchParams", () => {
	test("round-trips", () => {
		assertRoundTrips(adminSearchParams, {
			friendCode: ["1234-5678-9012", "SW-1234-5678-9012", "123456789012"],
		});
	});

	test("garbage decodes to default", () => {
		assertDecodesToDefault(adminSearchParams, "friendCode", [
			["not-a-friend-code"],
			["1234-5678"],
		]);
	});
});
