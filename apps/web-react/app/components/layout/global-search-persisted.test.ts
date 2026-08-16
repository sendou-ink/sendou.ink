import { describe, expect, test } from "vitest";
import {
	assertDecodesToDefault,
	assertRoundTrips,
} from "~/modules/persisted-state/persisted-state-test-utils";
import {
	recentWeaponsPersisted,
	searchTypePersisted,
} from "./global-search-persisted";

describe("searchTypePersisted", () => {
	test("round-trips", () => {
		assertRoundTrips(searchTypePersisted, [
			"weapons",
			"users",
			"teams",
			"organizations",
			"tournaments",
		]);
	});

	test("decodes legacy plain-string values", () => {
		expect(searchTypePersisted.decode("users")).toBe("users");
	});

	test("malformed values decode to the default", () => {
		assertDecodesToDefault(searchTypePersisted, ["USER", "[1]"]);
	});
});

describe("recentWeaponsPersisted", () => {
	test("round-trips", () => {
		assertRoundTrips(recentWeaponsPersisted, [[], [0, 10, 8000]]);
	});

	test("malformed values decode to the default", () => {
		assertDecodesToDefault(recentWeaponsPersisted, ["not json", "[99999]"]);
	});
});
