import * as React from "react";
import * as R from "remeda";

const LOCAL_STORAGE_KEY = "seen-friend-requests";
const MAX_STORED_IDS = 200;

const listeners = new Set<() => void>();

/**
 * Returns the count of incoming friend requests that the user has not yet seen.
 *
 * "Seen" requests are tracked per-device in local storage (the dedicated /friends
 * page remains the authoritative view). The count updates when requests are marked
 * as seen via {@link markFriendRequestsSeen} in the same tab, or when local storage
 * changes in another tab.
 */
export function useUnseenFriendRequests(incomingRequestIds: number[]): number {
	const raw = React.useSyncExternalStore(
		subscribe,
		getSnapshot,
		getServerSnapshot,
	);

	const seenIds = new Set(parseSeenIds(raw));

	return incomingRequestIds.filter((id) => !seenIds.has(id)).length;
}

/**
 * Records the given incoming friend request ids as seen, clearing the unseen badge.
 *
 * Ids are merged into the existing seen set rather than replacing it, so that
 * acting on a request (e.g. declining it) doesn't make an already-seen request
 * count as unseen again while other consumers still have a stale list. Only the
 * most recent ids are kept to keep the stored set from growing without bound.
 */
export function markFriendRequestsSeen(ids: number[]) {
	try {
		const merged = R.unique([...parseSeenIds(getSnapshot()), ...ids])
			.sort((a, b) => b - a)
			.slice(0, MAX_STORED_IDS);
		localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(merged));
		for (const listener of listeners) {
			listener();
		}
	} catch {
		// local storage may be unavailable
	}
}

function subscribe(listener: () => void) {
	listeners.add(listener);
	window.addEventListener("storage", listener);
	return () => {
		listeners.delete(listener);
		window.removeEventListener("storage", listener);
	};
}

function getSnapshot() {
	return localStorage.getItem(LOCAL_STORAGE_KEY) ?? "[]";
}

function getServerSnapshot() {
	return "[]";
}

function parseSeenIds(raw: string): number[] {
	try {
		const parsed = JSON.parse(raw);
		return Array.isArray(parsed) ? parsed : [];
	} catch {
		return [];
	}
}
