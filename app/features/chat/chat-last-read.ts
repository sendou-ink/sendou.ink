import * as React from "react";

const LOCAL_STORAGE_PREFIX = "chat_read__";

const listeners = new Set<() => void>();
let cachedCounts: Record<string, number> | null = null;

const SERVER_SNAPSHOT: Record<string, number> = {};

function readAllFromLocalStorage(): Record<string, number> {
	const counts: Record<string, number> = {};
	try {
		for (let i = 0; i < localStorage.length; i++) {
			const key = localStorage.key(i);
			if (!key?.startsWith(LOCAL_STORAGE_PREFIX)) continue;

			const parsed = Number(localStorage.getItem(key));
			counts[key.slice(LOCAL_STORAGE_PREFIX.length)] = Number.isFinite(parsed)
				? parsed
				: 0;
		}
	} catch {
		// localStorage may be unavailable
	}
	return counts;
}

function getSnapshot() {
	cachedCounts ??= readAllFromLocalStorage();
	return cachedCounts;
}

function subscribe(listener: () => void) {
	const handleStorage = (e: StorageEvent) => {
		if (e.key !== null && !e.key.startsWith(LOCAL_STORAGE_PREFIX)) return;
		cachedCounts = null;
		listener();
	};

	listeners.add(listener);
	window.addEventListener("storage", handleStorage);
	return () => {
		listeners.delete(listener);
		window.removeEventListener("storage", handleStorage);
	};
}

/**
 * The last read message count per chat room (chat code -> count), persisted in
 * localStorage and kept in sync across tabs via the `storage` event.
 */
export function useLastReadCounts(): Record<string, number> {
	return React.useSyncExternalStore(
		subscribe,
		getSnapshot,
		() => SERVER_SNAPSHOT,
	);
}

/** Persists the last read message count for a room, notifying subscribers in this tab (other tabs sync via the `storage` event). */
export function writeLastReadCount(chatCode: string, count: number) {
	try {
		localStorage.setItem(`${LOCAL_STORAGE_PREFIX}${chatCode}`, String(count));
	} catch {
		// localStorage may be unavailable
	}
	cachedCounts = null;
	for (const listener of listeners) {
		listener();
	}
}
