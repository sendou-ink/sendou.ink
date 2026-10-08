/**
 * Persistence for scanned VoDs, keyed by file name so a video can be reopened
 * without re-decoding. The summary lives in `vods`, detections in
 * `vod-events` under a `vod` index, full-res frames in `vod-frames` under the event id
 * (loadVodEventFrame), so listing stays cheap. The map opens' downscaled
 * frames live in `vod-minimaps` for coach mode, kept as long as the VoD. Re-scanning the same file name
 * overwrites the previous save; the frames age out by `frames.ts`.
 */

import type { SessionSummary } from "../core/sessions";
import {
	readwrite,
	tx,
	VOD_EVENTS_STORE,
	VOD_FRAMES_STORE,
	VOD_MINIMAPS_STORE,
	VODS_STORE,
} from "./db";
import { trimFrames } from "./frames";

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
	/** whether a full-res frame exists in `vod-frames` under this id */
	hasFrame?: boolean;
}

/** A vod-event to persist, with its (separately stored) frame attached. */
export type VodEventToSave = Omit<StoredVodEvent, "id" | "vod" | "hasFrame"> & {
	frame?: Blob;
};

/** A frame of an open map, downscaled. */
export interface VodMinimap {
	/** seconds into the VoD */
	t: number;
	image: Blob;
}

interface StoredVodMinimap extends VodMinimap {
	/** owning VoD name (indexed) */
	vod: string;
}

const VOD_STORES = [
	VODS_STORE,
	VOD_EVENTS_STORE,
	VOD_FRAMES_STORE,
	VOD_MINIMAPS_STORE,
];

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

/** Delete every minimap of `name`, then run `next`. */
function clearVodMinimaps(
	minimaps: IDBObjectStore,
	name: string,
	next: () => void,
): void {
	const req = minimaps.index("vod").getAllKeys(IDBKeyRange.only(name));
	req.onsuccess = () => {
		for (const key of req.result) minimaps.delete(key);
		next();
	};
}

export async function saveVod(
	meta: Omit<VodSummary, "eventCount">,
	events: VodEventToSave[],
	minimaps: VodMinimap[] = [],
): Promise<void> {
	await readwrite(VOD_STORES, (transaction) => {
		const eventStore = transaction.objectStore(VOD_EVENTS_STORE);
		const frameStore = transaction.objectStore(VOD_FRAMES_STORE);
		const minimapStore = transaction.objectStore(VOD_MINIMAPS_STORE);
		clearVodMinimaps(minimapStore, meta.name, () => {
			for (const minimap of minimaps) {
				minimapStore.add({ ...minimap, vod: meta.name });
			}
		});
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
	await trimFrames();
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

/** The VoD's map-open frames, chronological. */
export async function loadVodMinimaps(name: string): Promise<VodMinimap[]> {
	const minimaps = await tx(
		VOD_MINIMAPS_STORE,
		"readonly",
		(store) =>
			store.index("vod").getAll(IDBKeyRange.only(name)) as IDBRequest<
				StoredVodMinimap[]
			>,
	);
	return minimaps
		.map(({ t, image }) => ({ t, image }))
		.sort((a, b) => a.t - b.t);
}

/** The vod-event's full-res analyzed frame, or undefined when none was stored. */
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
		clearVodMinimaps(
			transaction.objectStore(VOD_MINIMAPS_STORE),
			name,
			() => {},
		);
	});
}
