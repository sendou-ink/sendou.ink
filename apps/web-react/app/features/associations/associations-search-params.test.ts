import { describe, test } from "vitest";
import {
	assertDecodesToDefault,
	assertRoundTrips,
} from "~/modules/search-params/search-params-test-utils";
import { associationsSearchParams } from "./associations-search-params";

describe("associationsSearchParams", () => {
	test("round-trips", () => {
		assertRoundTrips(associationsSearchParams, {
			inviteCode: ["abcdefghij", "A1b2C3d4E5"],
		});
	});

	test("garbage decodes to default", () => {
		assertDecodesToDefault(associationsSearchParams, "inviteCode", [
			["short"],
			["waytoolonginvitecode"],
		]);
	});
});
