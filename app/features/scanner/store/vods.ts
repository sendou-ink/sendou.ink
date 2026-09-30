/**
 * Persistence for completed VoD scans, keyed by file name so a video can be
 * reinspected without re-decoding. The summary lives in `vods`, detections in
 * `vod-events` under a `vod` index, full-res PNGs in `vod-frames` under the
 * event id (loadVodEventFrame), so listing stays cheap. Re-scanning the same
 * file name overwrites the previous save.
 */
import type { IngestedMatchLink } from "~/features/scanner-ingest/scanner-ingest-schemas";
import { db, tx, VOD_EVENTS_STORE, VOD_FRAMES_STORE, VODS_STORE } from "./db";

/** How a VoD's last "Send results" went; absent = never attempted. */
export interface VodResultsSend {
	/** matches sendou.ink /ingest accepted */
	sent: number;
	total: number;
	/** failure detail, null when the send went through */
	error: string | null;
	/** wall-clock time the send finished */
	at: number;
	/** links /ingest reported, keyed by index into the scan's ingestable matches */
	links?: Array<{ matchIndex: number; link: IngestedMatchLink }>;
}

export interface VodSummary {
	/** VoD file name — primary key */
	name: string;
	/** wall-clock time the scan finished */
	savedAt: number;
	/** video duration in seconds */
	duration: number;
	eventCount: number;
	resultsSend?: VodResultsSend;
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
}

/** A vod-event to persist, with its (separately stored) frame attached. */
export type VodEventToSave = Omit<StoredVodEvent, "id" | "vod" | "hasFrame"> & {
	frame?: Blob;
};

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

export async function saveVod(
	meta: Omit<VodSummary, "eventCount">,
	events: VodEventToSave[],
): Promise<void> {
	const database = await db();
	return new Promise((resolve, reject) => {
		const transaction = database.transaction(
			[VODS_STORE, VOD_EVENTS_STORE, VOD_FRAMES_STORE],
			"readwrite",
		);
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
		transaction.oncomplete = () => resolve();
		transaction.onerror = () => reject(transaction.error);
	});
}

/**
 * Records how a VoD's "Send results" went, so reopening the scan reports what
 * was sent. Re-scanning starts over: `saveVod` writes a summary without one.
 */
export async function saveVodResultsSend(
	name: string,
	resultsSend: VodResultsSend,
): Promise<void> {
	const database = await db();
	return new Promise((resolve, reject) => {
		const transaction = database.transaction(VODS_STORE, "readwrite");
		const vods = transaction.objectStore(VODS_STORE);
		const get = vods.get(name) as IDBRequest<VodSummary | undefined>;
		get.onsuccess = () => {
			const summary = get.result;
			if (!summary) return; // deleted meanwhile
			vods.put({ ...summary, resultsSend });
		};
		transaction.oncomplete = () => resolve();
		transaction.onerror = () => reject(transaction.error);
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

export async function deleteVod(name: string): Promise<void> {
	const database = await db();
	return new Promise((resolve, reject) => {
		const transaction = database.transaction(
			[VODS_STORE, VOD_EVENTS_STORE, VOD_FRAMES_STORE],
			"readwrite",
		);
		transaction.objectStore(VODS_STORE).delete(name);
		clearVodEvents(
			transaction.objectStore(VOD_EVENTS_STORE),
			transaction.objectStore(VOD_FRAMES_STORE),
			name,
			() => {},
		);
		transaction.oncomplete = () => resolve();
		transaction.onerror = () => reject(transaction.error);
	});
}
