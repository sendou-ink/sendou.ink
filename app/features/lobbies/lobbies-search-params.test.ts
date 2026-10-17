import { describe, test } from "bun:test";
import {
	assertDecodesToDefault,
	assertRoundTrips,
} from "~/modules/search-params/search-params-test-utils";
import {
	lobbiesSearchParams,
	lobbySearchParams,
} from "./lobbies-search-params";

describe("lobbiesSearchParams", () => {
	test("round-trips", () => {
		assertRoundTrips(lobbiesSearchParams, {
			tab: [null, "running", "upcoming", "ended"],
		});
	});

	test("malformed values decode to defaults", () => {
		assertDecodesToDefault(lobbiesSearchParams, "tab", [["garbage"]]);
	});
});

describe("lobbySearchParams", () => {
	test("round-trips", () => {
		assertRoundTrips(lobbySearchParams, {
			key: [null, "abcdefghij", "A1b2C3d4E5"],
		});
	});

	test("malformed values decode to defaults", () => {
		assertDecodesToDefault(lobbySearchParams, "key", [["short"]]);
	});
});
