import { describe, test } from "vitest";
import {
	assertDecodesToDefault,
	assertRoundTrips,
} from "~/modules/search-params/search-params-test-utils";
import { logInAsSearchParams } from "./dev-tools-search-params";

describe("logInAsSearchParams", () => {
	test("round-trips", () => {
		assertRoundTrips(logInAsSearchParams, {
			userId: [null, 1, 274],
			returnTo: [null, "/", "/q/match/5?tab=chat"],
		});
	});

	test("garbage decodes to default", () => {
		assertDecodesToDefault(logInAsSearchParams, "userId", [
			["abc"],
			["0"],
			["1.5"],
		]);
		assertDecodesToDefault(logInAsSearchParams, "returnTo", [
			["https://example.com"],
		]);
	});
});
