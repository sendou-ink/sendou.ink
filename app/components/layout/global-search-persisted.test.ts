import { describe, expect, it } from "vitest";
import {
	assertDecodesToDefault,
	assertRoundTrips,
} from "~/modules/persisted-state/persisted-state-test-utils";
import {
	recentWeaponsPersisted,
	searchTypePersisted,
} from "./global-search-persisted";

describe("searchTypePersisted", () => {
	it("round-trips", () => {
		assertRoundTrips(searchTypePersisted, [
			"weapons",
			"users",
			"teams",
			"organizations",
			"tournaments",
		]);
	});

	it("decodes legacy plain-string values", () => {
		expect(searchTypePersisted.decode("users")).toBe("users");
	});

	it("malformed values decode to the default", () => {
		assertDecodesToDefault(searchTypePersisted, ["USER", "[1]"]);
	});
});

describe("recentWeaponsPersisted", () => {
	it("round-trips", () => {
		assertRoundTrips(recentWeaponsPersisted, [[], [0, 10, 8000]]);
	});

	it("malformed values decode to the default", () => {
		assertDecodesToDefault(recentWeaponsPersisted, ["not json", "[99999]"]);
	});
});
