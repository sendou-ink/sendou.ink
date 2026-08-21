import * as v from "valibot";
import { usePersistedMapState } from "~/modules/persisted-state/hooks";
import * as PersistedState from "~/modules/persisted-state/persisted-state";

export const lastReadCountsPersisted = PersistedState.defineMap({
	keyPrefix: "chat_read__",
	storage: "local",
	schema: v.number(),
	default: 0,
});

/**
 * The last read message count per chat room (chat code -> count), persisted in
 * localStorage and kept in sync across tabs via the `storage` event.
 */
export function useLastReadCounts(): Record<string, number> {
	return usePersistedMapState(lastReadCountsPersisted);
}

/** Persists the last read message count for a room, notifying subscribers in this tab (other tabs sync via the `storage` event). */
export function writeLastReadCount(chatCode: string, count: number) {
	PersistedState.writeMapEntry(lastReadCountsPersisted, chatCode, count);
}
