import { describe, expect, it } from "vitest";
import { z } from "zod";
import * as PersistedState from "./persisted-state";
import {
	assertDecodesToDefault,
	assertRoundTrips,
} from "./persisted-state-test-utils";

const numberList = PersistedState.define({
	key: "test-number-list",
	storage: "local",
	schema: z.array(z.number()),
	default: [],
});

const searchType = PersistedState.define({
	key: "test-search-type",
	storage: "local",
	schema: z.enum(["weapons", "users"]),
	default: "weapons",
});

const dismissed = PersistedState.define({
	key: "test-dismissed",
	storage: "local",
	schema: z.boolean(),
	default: false,
});

const counts = PersistedState.defineMap({
	keyPrefix: "test-counts__",
	storage: "local",
	schema: z.number(),
	default: 0,
});

describe("define", () => {
	it("round-trips values", () => {
		assertRoundTrips(numberList, [[], [1, 2, 3]]);
		assertRoundTrips(searchType, ["weapons", "users"]);
		assertRoundTrips(dismissed, [true, false]);
		assertRoundTrips(counts, [0, 42]);
	});

	it("malformed values decode to defaults", () => {
		assertDecodesToDefault(numberList, ["not json", '{"a":1}', '["a","b"]']);
		assertDecodesToDefault(searchType, ["teams", "[1,2]"]);
		assertDecodesToDefault(dismissed, ["yes"]);
		assertDecodesToDefault(counts, ["abc", "", "Infinity"]);
	});

	it("decodes legacy plain-string values where the schema allows them", () => {
		expect(searchType.decode("users")).toBe("users");
		expect(dismissed.decode("true")).toBe(true);
		expect(counts.decode("7")).toBe(7);
	});
});

describe("prependToRecentList", () => {
	it("prepends a new item", () => {
		expect(PersistedState.prependToRecentList([1, 2], 3, 5)).toEqual([3, 1, 2]);
	});

	it("moves an existing item to the front", () => {
		expect(PersistedState.prependToRecentList([1, 2, 3], 2, 5)).toEqual([
			2, 1, 3,
		]);
	});

	it("caps the list length", () => {
		expect(PersistedState.prependToRecentList([1, 2, 3], 4, 3)).toEqual([
			4, 1, 2,
		]);
	});
});
