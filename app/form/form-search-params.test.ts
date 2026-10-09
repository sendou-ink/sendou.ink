import { describe, test } from "vitest";
import {
	assertDecodesToDefault,
	assertRoundTrips,
} from "~/modules/search-params/search-params-test-utils";
import { formSearchParams } from "./form-search-params";

describe("formSearchParams", () => {
	test("round-trips", () => {
		assertRoundTrips(formSearchParams, {
			step: [null, "basics", "teams"],
		});
	});

	test("decodes garbage to defaults", () => {
		assertDecodesToDefault(formSearchParams, "step", [["x".repeat(101)]]);
	});
});
