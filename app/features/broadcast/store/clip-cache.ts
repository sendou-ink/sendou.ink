/** What an OBS source keeps of the files sent to it, so loading it again doesn't send them again (see `ClipTransfer.ClipCache`). */
import type * as ClipTransfer from "../core/ClipTransfer";
import { RECEIVED_CLIPS_STORE, readwrite, request } from "./broadcast-db";

/** Keeps the files sent to an OBS source, see `ClipTransfer.ClipCache`. */
export const clipCache: ClipTransfer.ClipCache = { load, save };

/** Drops the files kept but for the given ones, e.g. the music of tracks no longer played. */
export async function keepOnly(clipIds: ReadonlySet<string>) {
	const kept = await request<IDBValidKey[]>(
		RECEIVED_CLIPS_STORE,
		"readonly",
		(store) => store.getAllKeys(),
	);
	const dropped = kept.filter((id) => !clipIds.has(String(id)));
	if (dropped.length === 0) return;

	await readwrite([RECEIVED_CLIPS_STORE], (transaction) => {
		const store = transaction.objectStore(RECEIVED_CLIPS_STORE);
		for (const id of dropped) store.delete(id);
	});
}

function load() {
	return request<ClipTransfer.CachedClip[]>(
		RECEIVED_CLIPS_STORE,
		"readonly",
		(store) => store.getAll(),
	);
}

async function save(clip: ClipTransfer.CachedClip) {
	await request(RECEIVED_CLIPS_STORE, "readwrite", (store) => store.put(clip));
}
