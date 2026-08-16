import type { CacheEntry } from "@epic-web/cachified";
import { ServerConfig } from "#lib/server/config.ts";

/**
 * A lightweight least-recently-used cache backed by a `Map`. Once `max` entries
 * are stored, inserting a new key evicts the least recently used one. Reading a
 * key via `get` marks it as most recently used.
 */
export class LRUCache<K, V> {
	private readonly max: number;
	private readonly map = new Map<K, V>();

	constructor({ max }: { max: number }) {
		this.max = max;
	}

	get(key: K): V | undefined {
		if (!this.map.has(key)) return undefined;

		const value = this.map.get(key) as V;
		this.map.delete(key);
		this.map.set(key, value);

		return value;
	}

	has(key: K): boolean {
		return this.map.has(key);
	}

	set(key: K, value: V): void {
		if (this.map.has(key)) {
			this.map.delete(key);
		}

		this.map.set(key, value);

		if (this.map.size > this.max) {
			const oldest = this.map.keys().next().value as K;
			this.map.delete(oldest);
		}
	}

	delete(key: K): void {
		this.map.delete(key);
	}

	clear(): void {
		this.map.clear();
	}
}

declare global {
	// This preserves the LRU cache during development
	var __lruCache: LRUCache<string, CacheEntry<unknown>> | undefined;
}

export const cache = (global.__lruCache = global.__lruCache
	? global.__lruCache
	: new LRUCache<string, CacheEntry<unknown>>({ max: 5000 }));

export const ttl = (ms: number) => (ServerConfig.disableCache ? 0 : ms);

export function syncCached<T>(key: string, getFreshValue: () => T) {
	if (cache.has(key)) {
		return cache.get(key) as T;
	}

	const value = getFreshValue();
	cache.set(key, value as CacheEntry<unknown>);

	return value;
}

export const IN_MILLISECONDS = {
	HALF_HOUR: 30 * 60 * 1000,
	ONE_HOUR: 60 * 60 * 1000,
	TWO_HOURS: 2 * 60 * 60 * 1000,
	TWO_DAYS: 2 * 24 * 60 * 60 * 1000,
};
