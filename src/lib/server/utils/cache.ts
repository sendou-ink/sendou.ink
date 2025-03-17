type CacheKey = string;

const cache = new Map<CacheKey, unknown>();

export function cached<T>(key: CacheKey, fn: () => T): () => T {
	return () => {
		if (cache.has(key)) {
			return cache.get(key) as T;
		}

		const value = fn();
		cache.set(key, value);
		return value;
	};
}
