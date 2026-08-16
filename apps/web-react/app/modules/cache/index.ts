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
