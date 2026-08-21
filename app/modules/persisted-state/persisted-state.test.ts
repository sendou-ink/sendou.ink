import * as v from "valibot";
import { describe, expect, test } from "vitest";
import * as PersistedState from "./persisted-state";
import {
	assertDecodesToDefault,
	assertRoundTrips,
} from "./persisted-state-test-utils";

const numberList = PersistedState.define({
	key: "test-number-list",
	storage: "local",
	schema: v.array(v.number()),
	default: [],
});

const searchType = PersistedState.define({
	key: "test-search-type",
	storage: "local",
	schema: v.picklist(["weapons", "users"]),
	default: "weapons",
});

const dismissed = PersistedState.define({
	key: "test-dismissed",
	storage: "local",
	schema: v.boolean(),
	default: false,
});

const counts = PersistedState.defineMap({
	keyPrefix: "test-counts__",
	storage: "local",
	schema: v.number(),
	default: 0,
});

describe("define", () => {
	test("round-trips values", () => {
		assertRoundTrips(numberList, [[], [1, 2, 3]]);
		assertRoundTrips(searchType, ["weapons", "users"]);
		assertRoundTrips(dismissed, [true, false]);
		assertRoundTrips(counts, [0, 42]);
	});

	test("malformed values decode to defaults", () => {
		assertDecodesToDefault(numberList, ["not json", '{"a":1}', '["a","b"]']);
		assertDecodesToDefault(searchType, ["teams", "[1,2]"]);
		assertDecodesToDefault(dismissed, ["yes"]);
		assertDecodesToDefault(counts, ["abc", "", "Infinity"]);
	});

	test("decodes legacy plain-string values where the schema allows them", () => {
		expect(searchType.decode("users")).toBe("users");
		expect(dismissed.decode("true")).toBe(true);
		expect(counts.decode("7")).toBe(7);
	});
});

describe("prependToRecentList", () => {
	test("prepends a new item", () => {
		expect(PersistedState.prependToRecentList([1, 2], 3, 5)).toEqual([3, 1, 2]);
	});

	test("moves an existing item to the front", () => {
		expect(PersistedState.prependToRecentList([1, 2, 3], 2, 5)).toEqual([
			2, 1, 3,
		]);
	});

	test("caps the list length", () => {
		expect(PersistedState.prependToRecentList([1, 2, 3], 4, 3)).toEqual([
			4, 1, 2,
		]);
	});
});
