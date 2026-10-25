import * as v from "valibot";
import { IS_DEV_BUILD } from "~/utils/dev-build";
import type { AnySyncSchema } from "~/utils/schema";

const readCaches = new WeakMap<
	object,
	{ raw: string | null; value: unknown }
>();
const mapCaches = new WeakMap<object, Record<string, unknown>>();
const listenersByDefinition = new WeakMap<object, Set<() => void>>();
// values whose write web storage refused (private mode, full quota) still apply for the rest of the visit
const unstoredValues = new WeakMap<object, { value: unknown }>();
const unstoredMapEntries = new WeakMap<object, Record<string, unknown>>();
const cachedMapPrefixes = new Map<object, string>();

// another tab's write makes a cached map stale even when nothing in this tab subscribes to it
if (typeof window !== "undefined") {
	window.addEventListener("storage", (event) => {
		for (const [definition, keyPrefix] of cachedMapPrefixes) {
			if (event.key === null || event.key.startsWith(keyPrefix)) {
				mapCaches.delete(definition);
			}
		}
	});
}

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
 * One definition per storage key drives reads, writes, cross-tab sync and `usePersistedState`. Decoding is
 * total: missing or malformed resolves to the default, legacy plain strings are accepted where the schema allows.
 */
export function define<S extends AnySyncSchema>(options: {
	key: string;
	storage: StorageKind;
	schema: S;
	default: v.InferOutput<S>;
}): PersistedDefinition<v.InferOutput<S>> {
	const definition = {
		key: options.key,
		storage: options.storage,
		default: options.default,
		...codec(options.schema, options.default),
	};

	if (IS_DEV_BUILD) devToolsRegistry.set(definition.key, definition);

	return definition;
}

/** Keyed family sharing a storage key prefix, for entries written independently (e.g. per chat room). */
export function defineMap<S extends AnySyncSchema>(options: {
	keyPrefix: string;
	storage: StorageKind;
	schema: S;
	default: v.InferOutput<S>;
}): PersistedMapDefinition<v.InferOutput<S>> {
	const definition = {
		keyPrefix: options.keyPrefix,
		storage: options.storage,
		default: options.default,
		...codec(options.schema, options.default),
	};

	if (IS_DEV_BUILD) devToolsRegistry.set(definition.keyPrefix, definition);

	return definition;
}

const devToolsRegistry = new Map<
	string,
	PersistedDefinition<unknown> | PersistedMapDefinition<unknown>
>();

/** Dev tools only: every definition loaded so far, keyed by storage key or prefix. Always empty in production builds. */
export function definitionsForDevTools() {
	return [...devToolsRegistry.values()];
}

/** Dev tools only: every raw entry of both web storages, including keys no definition declares. */
export function rawEntriesForDevTools() {
	const entries: Array<{ storage: StorageKind; key: string; raw: string }> = [];
	for (const storage of ["local", "session"] as const) {
		try {
			const store = storageOf(storage);
			for (let index = 0; index < store.length; index++) {
				const key = store.key(index);
				if (key === null) continue;
				entries.push({ storage, key, raw: store.getItem(key) ?? "" });
			}
		} catch {
			// web storage may be unavailable
		}
	}

	return entries;
}

/** Dev tools only: removes a raw entry and notifies the subscribers of the definition owning it. */
export function removeRawEntryForDevTools(storage: StorageKind, key: string) {
	try {
		storageOf(storage).removeItem(key);
	} catch {
		// web storage may be unavailable
	}

	for (const definition of devToolsRegistry.values()) {
		const owns =
			"key" in definition
				? definition.key === key
				: key.startsWith(definition.keyPrefix);
		if (!owns) continue;

		unstoredValues.delete(definition);
		readCaches.delete(definition);
		mapCaches.delete(definition);
		notify(definition);
	}
}

/** Reads the persisted value, resolving to the default on the server or when the stored value is missing or malformed. */
export function read<T>(definition: PersistedDefinition<T>): T {
	const unstored = unstoredValues.get(definition);
	if (unstored) return unstored.value as T;
	if (typeof window === "undefined") return definition.default;

	const raw = readRaw(definition.storage, definition.key);
	const cached = readCaches.get(definition);
	if (cached && cached.raw === raw) return cached.value as T;

	const value = definition.decode(raw);
	readCaches.set(definition, { raw, value });
	return value;
}

/**
 * Writes the value to web storage and notifies this tab's subscribers (other tabs sync via the `storage` event).
 * Returns false when web storage is unavailable or full, the value then only lasts until the page is left.
 */
export function write<T>(definition: PersistedDefinition<T>, value: T) {
	let isStored = true;
	try {
		storageOf(definition.storage).setItem(
			definition.key,
			definition.encode(value),
		);
		unstoredValues.delete(definition);
	} catch {
		isStored = false;
		unstoredValues.set(definition, { value });
	}
	notify(definition);

	return isStored;
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
	const cached = mapCaches.get(definition);
	if (cached) return cached as Record<string, T>;

	const unstored = unstoredMapEntries.get(definition);
	if (typeof window === "undefined" && !unstored) {
		return SERVER_MAP_SNAPSHOT as Record<string, T>;
	}

	const value = {
		...(typeof window === "undefined" ? {} : readMapFromStorage(definition)),
		...(unstored as Record<string, T> | undefined),
	};
	mapCaches.set(definition, value);
	cachedMapPrefixes.set(definition, definition.keyPrefix);
	return value;
}

/**
 * Writes one entry of a persisted map and notifies this tab's subscribers (other tabs sync via the `storage` event).
 * Returns false when web storage is unavailable or full, the entry then only lasts until the page is left.
 */
export function writeMapEntry<T>(
	definition: PersistedMapDefinition<T>,
	entryKey: string,
	value: T,
) {
	const unstored = { ...unstoredMapEntries.get(definition) };
	let isStored = true;
	try {
		storageOf(definition.storage).setItem(
			`${definition.keyPrefix}${entryKey}`,
			definition.encode(value),
		);
		delete unstored[entryKey];
	} catch {
		isStored = false;
		unstored[entryKey] = value;
	}
	unstoredMapEntries.set(definition, unstored);
	mapCaches.delete(definition);
	notify(definition);

	return isStored;
}

/** Removes one entry of a persisted map and notifies this tab's subscribers (other tabs sync via the `storage` event). */
export function removeMapEntry<T>(
	definition: PersistedMapDefinition<T>,
	entryKey: string,
) {
	try {
		storageOf(definition.storage).removeItem(
			`${definition.keyPrefix}${entryKey}`,
		);
	} catch {
		// web storage may be unavailable
	}
	const unstored = { ...unstoredMapEntries.get(definition) };
	delete unstored[entryKey];
	unstoredMapEntries.set(definition, unstored);
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
