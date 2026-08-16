import { describe, expect, test } from "vitest";
import { LRUCache } from "./index";

describe("LRUCache", () => {
	test("stores and retrieves values", () => {
		const cache = new LRUCache<string, number>({ max: 2 });
		cache.set("a", 1);

		expect(cache.get("a")).toBe(1);
		expect(cache.has("a")).toBe(true);
	});

	test("returns undefined for missing keys", () => {
		const cache = new LRUCache<string, number>({ max: 2 });

		expect(cache.get("missing")).toBeUndefined();
		expect(cache.has("missing")).toBe(false);
	});

	test("evicts the least recently used entry once over capacity", () => {
		const cache = new LRUCache<string, number>({ max: 2 });
		cache.set("a", 1);
		cache.set("b", 2);
		cache.set("c", 3);

		expect(cache.has("a")).toBe(false);
		expect(cache.get("b")).toBe(2);
		expect(cache.get("c")).toBe(3);
	});

	test("counts reads as recent use", () => {
		const cache = new LRUCache<string, number>({ max: 2 });
		cache.set("a", 1);
		cache.set("b", 2);
		cache.get("a");
		cache.set("c", 3);

		expect(cache.has("a")).toBe(true);
		expect(cache.has("b")).toBe(false);
	});

	test("updates value without growing past capacity on re-set", () => {
		const cache = new LRUCache<string, number>({ max: 2 });
		cache.set("a", 1);
		cache.set("a", 2);

		expect(cache.get("a")).toBe(2);
	});

	test("deletes a single entry", () => {
		const cache = new LRUCache<string, number>({ max: 2 });
		cache.set("a", 1);
		cache.delete("a");

		expect(cache.has("a")).toBe(false);
	});

	test("clears all entries", () => {
		const cache = new LRUCache<string, number>({ max: 2 });
		cache.set("a", 1);
		cache.set("b", 2);
		cache.clear();

		expect(cache.has("a")).toBe(false);
		expect(cache.has("b")).toBe(false);
	});
});
