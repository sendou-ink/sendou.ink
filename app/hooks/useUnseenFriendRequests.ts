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

/** Incoming requests not yet seen; "seen" is tracked per device in local storage via {@link markFriendRequestsSeen}. */
export function useUnseenFriendRequests(incomingRequestIds: number[]): number {
	const [seenIdsList] = usePersistedState(seenFriendRequestsPersisted);

	const seenIds = new Set(seenIdsList);

	return incomingRequestIds.filter((id) => !seenIds.has(id)).length;
}

/**
 * Merged into the seen set rather than replacing it, so acting on a request doesn't make an already-seen
 * one unseen for consumers with a stale list. Only the most recent ids are kept.
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
