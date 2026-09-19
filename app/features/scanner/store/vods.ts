/**
 * Persistence for scanned VoDs, keyed by file name so a video can be reopened
 * without re-decoding. The summary lives in `vods`, detections in
 * `vod-events` under a `vod` index (each carrying its own /ingest send status,
 * like a live event), full-res PNGs in `vod-frames` under the event id
 * (loadVodEventFrame), so listing stays cheap. Re-scanning the same file name
 * overwrites the previous save.
 */

import type { SessionSummary } from "../core/sessions";
import {
	readwrite,
	tx,
	VOD_EVENTS_STORE,
	VOD_FRAMES_STORE,
	VODS_STORE,
} from "./db";
import type { SendStatus } from "./events";

export interface VodSummary {
	/** VoD file name — primary key */
	name: string;
	/** wall-clock time the scan (or its last resumption) finished */
	savedAt: number;
	/** video duration in seconds */
	duration: number;
	eventCount: number;
	/** the header numbers, computed at save time so listing needs no events */
	summary: SessionSummary;
}

export interface StoredVodEvent {
	id?: number;
	/** owning VoD name (indexed) */
	vod: string;
	type: string;
	t: number;
	confidence: number;
	data: unknown;
	/** small JPEG data URL of the source frame */
	thumbnail?: string;
	/** whether a full-res frame exists in `vod-frames` under this id */
	hasFrame?: boolean;
	send?: SendStatus;
}

/** A vod-event to persist, with its (separately stored) frame attached. */
export type VodEventToSave = Omit<StoredVodEvent, "id" | "vod" | "hasFrame"> & {
	frame?: Blob;
};

const VOD_STORES = [VODS_STORE, VOD_EVENTS_STORE, VOD_FRAMES_STORE];

/** Delete every vod-event (and frame) of `name` via the index, then run `next`. */
function clearVodEvents(
	events: IDBObjectStore,
	frames: IDBObjectStore,
	name: string,
	next: () => void,
): void {
	const req = events.index("vod").openCursor(IDBKeyRange.only(name));
	req.onsuccess = () => {
		const cursor = req.result;
		if (cursor) {
			frames.delete(cursor.primaryKey);
			cursor.delete();
			cursor.continue();
		} else {
			next();
		}
	};
}

export function saveVod(
	meta: Omit<VodSummary, "eventCount">,
	events: VodEventToSave[],
): Promise<void> {
	return readwrite(VOD_STORES, (transaction) => {
		const eventStore = transaction.objectStore(VOD_EVENTS_STORE);
		const frameStore = transaction.objectStore(VOD_FRAMES_STORE);
		clearVodEvents(eventStore, frameStore, meta.name, () => {
			for (const { frame, ...event } of events) {
				const add = eventStore.add({
					...event,
					vod: meta.name,
					hasFrame: frame !== undefined,
				}) as IDBRequest<number>;
				if (frame) add.onsuccess = () => frameStore.put(frame, add.result);
			}
			transaction
				.objectStore(VODS_STORE)
				.put({ ...meta, eventCount: events.length });
		});
	});
}

export async function listVods(): Promise<VodSummary[]> {
	const vods = await tx(
		VODS_STORE,
		"readonly",
		(store) => store.getAll() as IDBRequest<VodSummary[]>,
	);
	return vods.sort((a, b) => b.savedAt - a.savedAt);
}

export function loadVod(name: string): Promise<VodSummary | undefined> {
	return tx(
		VODS_STORE,
		"readonly",
		(store) => store.get(name) as IDBRequest<VodSummary | undefined>,
	);
}

export async function loadVodEvents(name: string): Promise<StoredVodEvent[]> {
	const events = await tx(
		VOD_EVENTS_STORE,
		"readonly",
		(store) =>
			store.index("vod").getAll(IDBKeyRange.only(name)) as IDBRequest<
				StoredVodEvent[]
			>,
	);
	return events.sort((a, b) => a.t - b.t);
}

/** The vod-event's full-res analyzed PNG, or undefined when none was stored. */
export function loadVodEventFrame(id: number): Promise<Blob | undefined> {
	return tx(
		VOD_FRAMES_STORE,
		"readonly",
		(store) => store.get(id) as IDBRequest<Blob | undefined>,
	);
}

export function deleteVod(name: string): Promise<void> {
	return readwrite(VOD_STORES, (transaction) => {
		transaction.objectStore(VODS_STORE).delete(name);
		clearVodEvents(
			transaction.objectStore(VOD_EVENTS_STORE),
			transaction.objectStore(VOD_FRAMES_STORE),
			name,
			() => {},
		);
	});
}
