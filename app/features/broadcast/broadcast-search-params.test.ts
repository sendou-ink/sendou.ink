import { describe, test } from "vitest";
import {
	assertDecodesToDefault,
	assertRoundTrips,
} from "~/modules/search-params/search-params-test-utils";
import {
	broadcastOverlaySearchParams,
	broadcastStreamSearchParams,
} from "./broadcast-search-params";

describe("broadcastOverlaySearchParams", () => {
	test("round-trips", () => {
		assertRoundTrips(broadcastOverlaySearchParams, {
			view: ["live", "next"],
			preview: [false, true],
		});
	});

	test("malformed values decode to defaults", () => {
		assertDecodesToDefault(broadcastOverlaySearchParams, "view", [["garbage"]]);
	});
});

describe("broadcastStreamSearchParams", () => {
	test("round-trips", () => {
		assertRoundTrips(broadcastStreamSearchParams, {
			role: ["source", "preview", "dashboard"],
		});
	});

	test("malformed values decode to defaults", () => {
		assertDecodesToDefault(broadcastStreamSearchParams, "role", [["garbage"]]);
	});
});
