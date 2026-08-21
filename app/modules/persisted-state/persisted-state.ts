import * as v from "valibot";
import type { AnySyncSchema } from "~/utils/schema";

const readCaches = new WeakMap<
	object,
	{ raw: string | null; value: unknown }
>();
const mapCaches = new WeakMap<object, Record<string, unknown>>();
const listenersByDefinition = new WeakMap<object, Set<() => void>>();

const SERVER_MAP_SNAPSHOT: Record<string, never> = {};

type StorageKind = "local" | "session";

interface DefinitionBase<T> {
	storage: StorageKind;
	default: T;
	/** Decodes a raw stored string. Total: resolves to the default for missing or malformed values, never throws. */
	decode: (raw: string | null) => T;
	/** Encodes a value into its stored string form. */
	encode: (value: T) => string;
}

export interface PersistedDefinition<T> extends DefinitionBase<T> {
	key: string;
}

export interface PersistedMapDefinition<T> extends DefinitionBase<T> {
	keyPrefix: string;
}

/**
 * Declares a client state persisted in web storage. One definition per stored
 * key drives reads, writes, cross-tab sync and the `usePersistedState` hook.
 * Decoding is total: the default resolves for missing or malformed values,
 * legacy plain-string values are accepted where the schema allows them.
 */
export function define<S extends AnySyncSchema>(options: {
	key: string;
	storage: StorageKind;
	schema: S;
	default: v.InferOutput<S>;
}): PersistedDefinition<v.InferOutput<S>> {
	return {
		key: options.key,
		storage: options.storage,
		default: options.default,
		...codec(options.schema, options.default),
	};
}

/**
 * Declares a keyed family of persisted values sharing a storage key prefix,
 * for maps whose entries are written independently (e.g. per chat room).
 */
export function defineMap<S extends AnySyncSchema>(options: {
	keyPrefix: string;
	storage: StorageKind;
	schema: S;
	default: v.InferOutput<S>;
}): PersistedMapDefinition<v.InferOutput<S>> {
	return {
		keyPrefix: options.keyPrefix,
		storage: options.storage,
		default: options.default,
		...codec(options.schema, options.default),
	};
}

/** Reads the persisted value, resolving to the default on the server or when the stored value is missing or malformed. */
export function read<T>(definition: PersistedDefinition<T>): T {
	if (typeof window === "undefined") return definition.default;

	const raw = readRaw(definition.storage, definition.key);
	const cached = readCaches.get(definition);
	if (cached && cached.raw === raw) return cached.value as T;

	const value = definition.decode(raw);
	readCaches.set(definition, { raw, value });
	return value;
}

/** Writes the value to web storage and notifies this tab's subscribers (other tabs sync via the `storage` event). */
export function write<T>(definition: PersistedDefinition<T>, value: T) {
	try {
		storageOf(definition.storage).setItem(
			definition.key,
			definition.encode(value),
		);
	} catch {
		// web storage may be unavailable
	}
	notify(definition);
}

/** Subscribes to changes of the persisted value, from both this tab's writes and other tabs via the `storage` event. */
export function subscribe<T>(
	definition: PersistedDefinition<T>,
	listener: () => void,
) {
	const listeners = listenersOf(definition);
	listeners.add(listener);

	const handleStorageEvent = (event: StorageEvent) => {
		if (event.key !== null && event.key !== definition.key) return;
		listener();
	};
	window.addEventListener("storage", handleStorageEvent);

	return () => {
		listeners.delete(listener);
		window.removeEventListener("storage", handleStorageEvent);
	};
}

/** Reads all entries of a persisted map, keyed by the part of the storage key after the prefix. */
export function readMap<T>(
	definition: PersistedMapDefinition<T>,
): Record<string, T> {
	if (typeof window === "undefined") {
		return SERVER_MAP_SNAPSHOT as Record<string, T>;
	}

	const cached = mapCaches.get(definition);
	if (cached) return cached as Record<string, T>;

	const value = readMapFromStorage(definition);
	mapCaches.set(definition, value);
	return value;
}

/** Writes one entry of a persisted map and notifies this tab's subscribers (other tabs sync via the `storage` event). */
export function writeMapEntry<T>(
	definition: PersistedMapDefinition<T>,
	entryKey: string,
	value: T,
) {
	try {
		storageOf(definition.storage).setItem(
			`${definition.keyPrefix}${entryKey}`,
			definition.encode(value),
		);
	} catch {
		// web storage may be unavailable
	}
	mapCaches.delete(definition);
	notify(definition);
}

/** Subscribes to changes of any entry of a persisted map, from both this tab's writes and other tabs via the `storage` event. */
export function subscribeMap<T>(
	definition: PersistedMapDefinition<T>,
	listener: () => void,
) {
	const listeners = listenersOf(definition);
	listeners.add(listener);

	const handleStorageEvent = (event: StorageEvent) => {
		if (event.key !== null && !event.key.startsWith(definition.keyPrefix)) {
			return;
		}
		mapCaches.delete(definition);
		listener();
	};
	window.addEventListener("storage", handleStorageEvent);

	return () => {
		listeners.delete(listener);
		window.removeEventListener("storage", handleStorageEvent);
	};
}

/** Moves `item` to the front of a most-recently-used list, deduplicating it and capping the list's length. */
export function prependToRecentList<T>(
	items: readonly T[],
	item: T,
	maxLength: number,
): T[] {
	return [item, ...items.filter((existing) => existing !== item)].slice(
		0,
		maxLength,
	);
}

function codec<S extends AnySyncSchema>(
	schema: S,
	defaultValue: v.InferOutput<S>,
) {
	return {
		decode: (raw: string | null): v.InferOutput<S> => {
			if (raw === null) return defaultValue;
			const parsed = v.safeParse(schema, rawToJson(raw));
			return parsed.success ? parsed.output : defaultValue;
		},
		encode: (value: v.InferOutput<S>) => JSON.stringify(value),
	};
}

function rawToJson(raw: string): unknown {
	try {
		return JSON.parse(raw);
	} catch {
		// legacy values were stored as plain strings
		return raw;
	}
}

function storageOf(kind: StorageKind): Storage {
	return kind === "local" ? window.localStorage : window.sessionStorage;
}

function readRaw(kind: StorageKind, key: string): string | null {
	try {
		return storageOf(kind).getItem(key);
	} catch {
		return null;
	}
}

function readMapFromStorage<T>(
	definition: PersistedMapDefinition<T>,
): Record<string, T> {
	const result: Record<string, T> = {};
	try {
		const storage = storageOf(definition.storage);
		for (let i = 0; i < storage.length; i++) {
			const key = storage.key(i);
			if (!key?.startsWith(definition.keyPrefix)) continue;

			result[key.slice(definition.keyPrefix.length)] = definition.decode(
				storage.getItem(key),
			);
		}
	} catch {
		// web storage may be unavailable
	}
	return result;
}

function listenersOf(definition: object): Set<() => void> {
	let listeners = listenersByDefinition.get(definition);
	if (!listeners) {
		listeners = new Set();
		listenersByDefinition.set(definition, listeners);
	}
	return listeners;
}

function notify(definition: object) {
	for (const listener of listenersOf(definition)) {
		listener();
	}
}
