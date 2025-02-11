import type { CacheEntry } from "@epic-web/cachified";
import { LRUCache } from "lru-cache";

declare global {
	// This preserves the LRU cache during development
	var __lruCache: LRUCache<string, CacheEntry<unknown>> | undefined;
}

// biome-ignore lint/suspicious/noAssignInExpressions: trick to only create one
export const cache = (global.__lruCache = global.__lruCache
	? global.__lruCache
	: new LRUCache<string, CacheEntry<unknown>>({ max: 5000 }));

export const ttl = (ms: number) =>
	process.env.DISABLE_CACHE === "true" ? 0 : ms;

export function syncCached<T>(key: string, getFreshValue: () => T) {
	if (cache.has(key)) {
		return cache.get(key) as T;
	}

	const value = getFreshValue();
	cache.set(key, value as any);

	return value;
}
