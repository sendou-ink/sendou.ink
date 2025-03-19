type CacheKey = string;

const cache = new Map<CacheKey, unknown>();

export function cached<T>(key: CacheKey, fn: () => Promise<T>) {
	return async () => {
		if (cache.has(key)) {
			return cache.get(key) as T;
		}

		const value = await fn();
		cache.set(key, value);
		return value;
	};
}
