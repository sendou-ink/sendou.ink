import cachified, { type CacheEntry } from "@epic-web/cachified";
import { LRUCache } from "~/modules/cache";
import { ttl } from "~/utils/cache.server";

/** Separate from the app-wide cache so the many small feed entries can't evict its big ones */
const feedCache = new LRUCache<string, CacheEntry<unknown>>({ max: 50_000 });

const byIdCache = new LRUCache<string, { value: unknown; expiresAt: number }>({
	max: 50_000,
});

/**
 * The value of the key, computed at most once per `ttlMs`. Past that the stale value is still
 * returned for up to `staleMs` while a fresh one is computed in the background.
 */
export function cached<T>({
	key,
	ttlMs,
	staleMs = ttlMs * 10,
	getFreshValue,
}: {
	key: string;
	ttlMs: number;
	staleMs?: number;
	getFreshValue: () => Promise<T>;
}) {
	return cachified({
		key,
		cache: feedCache,
		ttl: ttl(ttlMs),
		staleWhileRevalidate: ttl(staleMs),
		getFreshValue,
	});
}

/** Rows by id, the ones not cached within `ttlMs` fetched with one call of `fetch`. */
export async function cachedByIds<T>({
	prefix,
	ids,
	ttlMs,
	fetch,
	idOf,
}: {
	prefix: string;
	ids: number[];
	ttlMs: number;
	fetch: (ids: number[]) => Promise<T[]>;
	idOf: (row: T) => number;
}): Promise<Map<number, T>> {
	const now = Date.now();
	const result = new Map<number, T>();
	const missingIds: number[] = [];

	for (const id of new Set(ids)) {
		const entry = byIdCache.get(`${prefix}-${id}`);
		if (entry && entry.expiresAt > now) {
			result.set(id, entry.value as T);
		} else {
			missingIds.push(id);
		}
	}

	if (missingIds.length > 0) {
		const expiresAt = now + ttl(ttlMs);
		for (const row of await fetch(missingIds)) {
			byIdCache.set(`${prefix}-${idOf(row)}`, { value: row, expiresAt });
			result.set(idOf(row), row);
		}
	}

	return result;
}
