import * as R from "remeda";
import * as v from "valibot";
import { usePersistedState } from "~/modules/persisted-state/hooks";
import * as PersistedState from "~/modules/persisted-state/persisted-state";

const MAX_STORED_IDS = 200;

export const seenFriendRequestsPersisted = PersistedState.define({
	key: "seen-friend-requests",
	storage: "local",
	schema: v.array(v.number()),
	default: [],
});

/**
 * Returns the count of incoming friend requests that the user has not yet seen.
 *
 * "Seen" requests are tracked per-device in local storage (the dedicated /friends
 * page remains the authoritative view). The count updates when requests are marked
 * as seen via {@link markFriendRequestsSeen} in the same tab, or when local storage
 * changes in another tab.
 */
export function useUnseenFriendRequests(incomingRequestIds: number[]): number {
	const [seenIdsList] = usePersistedState(seenFriendRequestsPersisted);

	const seenIds = new Set(seenIdsList);

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
	const merged = R.unique([
		...PersistedState.read(seenFriendRequestsPersisted),
		...ids,
	])
		.sort((a, b) => b - a)
		.slice(0, MAX_STORED_IDS);

	PersistedState.write(seenFriendRequestsPersisted, merged);
}
