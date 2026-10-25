import * as v from "valibot";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
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

// unit tests run without `window`, so every write is one web storage refuses
describe("without web storage", () => {
	test("a written value lasts for the visit", () => {
		const unstoredList = PersistedState.define({
			key: "test-unstored-list",
			storage: "local",
			schema: v.array(v.number()),
			default: [],
		});

		expect(PersistedState.write(unstoredList, [1, 2])).toBe(false);
		expect(PersistedState.read(unstoredList)).toEqual([1, 2]);
	});

	test("written map entries last for the visit until removed", () => {
		const unstoredCounts = PersistedState.defineMap({
			keyPrefix: "test-unstored-counts__",
			storage: "local",
			schema: v.number(),
			default: 0,
		});

		expect(PersistedState.writeMapEntry(unstoredCounts, "a", 1)).toBe(false);
		PersistedState.writeMapEntry(unstoredCounts, "b", 2);
		PersistedState.removeMapEntry(unstoredCounts, "a");

		expect(PersistedState.readMap(unstoredCounts)).toEqual({ b: 2 });
	});
});

describe("dev tools registry", () => {
	beforeEach(() => {
		vi.stubGlobal("window", {
			localStorage: memoryStorage(),
			sessionStorage: memoryStorage(),
			addEventListener: () => {},
			removeEventListener: () => {},
		});
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	test("lists every definition loaded so far", () => {
		expect(PersistedState.definitionsForDevTools()).toEqual(
			expect.arrayContaining([numberList, counts]),
		);
	});

	test("lists raw entries of both storages, undeclared keys included", () => {
		PersistedState.write(dismissed, true);
		window.sessionStorage.setItem("undeclared", "raw");

		expect(PersistedState.rawEntriesForDevTools()).toEqual([
			{ storage: "local", key: "test-dismissed", raw: "true" },
			{ storage: "session", key: "undeclared", raw: "raw" },
		]);
	});

	test("removing an exact key notifies subscribers and resets the value", () => {
		PersistedState.write(numberList, [1, 2]);
		const listener = vi.fn();
		const unsubscribe = PersistedState.subscribe(numberList, listener);

		PersistedState.removeRawEntryForDevTools("local", "test-number-list");
		unsubscribe();

		expect(listener).toHaveBeenCalledOnce();
		expect(PersistedState.read(numberList)).toEqual([]);
	});

	test("removing a prefixed key notifies map subscribers and drops the entry", () => {
		PersistedState.writeMapEntry(counts, "a", 1);
		PersistedState.writeMapEntry(counts, "b", 2);
		expect(PersistedState.readMap(counts)).toEqual({ a: 1, b: 2 });
		const listener = vi.fn();
		const unsubscribe = PersistedState.subscribeMap(counts, listener);

		PersistedState.removeRawEntryForDevTools("local", "test-counts__a");
		unsubscribe();

		expect(listener).toHaveBeenCalledOnce();
		expect(PersistedState.readMap(counts)).toEqual({ b: 2 });
	});
});

function memoryStorage() {
	const items = new Map<string, string>();

	return {
		get length() {
			return items.size;
		},
		key: (index: number) => [...items.keys()][index] ?? null,
		getItem: (key: string) => items.get(key) ?? null,
		setItem: (key: string, value: string) => {
			items.set(key, value);
		},
		removeItem: (key: string) => {
			items.delete(key);
		},
	};
}
