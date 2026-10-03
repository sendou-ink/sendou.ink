/**
 * Retention of the analyzed frames, live (`frames`) and VoD (`vod-frames`)
 * alike: they are what a misread is reported with, so they are kept for
 * `FRAME_MAX_AGE_MS`, newest first within `MAX_FRAME_BYTES`. A live frame is
 * dated by its event's detection, a VoD's by the scan's save. A dropped
 * frame's event stays, marked frameless.
 */
import {
	EVENTS_STORE,
	FRAMES_STORE,
	readwrite,
	VOD_EVENTS_STORE,
	VOD_FRAMES_STORE,
	VODS_STORE,
} from "./db";
import type { StoredEvent } from "./events";
import type { StoredVodEvent, VodSummary } from "./vods";

export const MAX_FRAME_BYTES = 500 * 1024 * 1024;
export const FRAME_MAX_AGE_MS = 72 * 60 * 60 * 1000;

const FRAME_STORES = [
	EVENTS_STORE,
	FRAMES_STORE,
	VODS_STORE,
	VOD_EVENTS_STORE,
	VOD_FRAMES_STORE,
];

interface FrameEntry {
	frames: IDBObjectStore;
	events: IDBObjectStore;
	id: number;
	bytes: number;
	/** wall-clock ms the frame dates from */
	at: number;
	event: StoredEvent | StoredVodEvent | undefined;
}

/** Drops the frames past the age limit or the size budget, oldest first. */
export function trimFrames(maxBytes = MAX_FRAME_BYTES): Promise<void> {
	return readwrite(FRAME_STORES, (transaction) => {
		retainFrames(transaction, maxBytes, Date.now()).catch(() =>
			transaction.abort(),
		);
	});
}

async function retainFrames(
	transaction: IDBTransaction,
	maxBytes: number,
	now: number,
): Promise<void> {
	const liveFrames = transaction.objectStore(FRAMES_STORE);
	const liveEvents = transaction.objectStore(EVENTS_STORE);
	const vodFrames = transaction.objectStore(VOD_FRAMES_STORE);
	const vodEvents = transaction.objectStore(VOD_EVENTS_STORE);

	const [liveSizes, vodSizes, vods] = await Promise.all([
		frameSizes(liveFrames),
		frameSizes(vodFrames),
		request(
			transaction.objectStore(VODS_STORE).getAll() as IDBRequest<VodSummary[]>,
		),
	]);
	const savedAtByVod = new Map(vods.map((vod) => [vod.name, vod.savedAt]));

	const entries: FrameEntry[] = await Promise.all([
		...liveSizes.map(async ({ id, bytes }) => {
			const event = await request(
				liveEvents.get(id) as IDBRequest<StoredEvent | undefined>,
			);
			return {
				frames: liveFrames,
				events: liveEvents,
				id,
				bytes,
				at: event?.detectedAt ?? 0,
				event,
			};
		}),
		...vodSizes.map(async ({ id, bytes }) => {
			const event = await request(
				vodEvents.get(id) as IDBRequest<StoredVodEvent | undefined>,
			);
			return {
				frames: vodFrames,
				events: vodEvents,
				id,
				bytes,
				at: (event && savedAtByVod.get(event.vod)) ?? 0,
				event,
			};
		}),
	]);

	let total = 0;
	for (const entry of entries.sort((a, b) => b.at - a.at || b.id - a.id)) {
		total += entry.bytes;
		if (now - entry.at <= FRAME_MAX_AGE_MS && total <= maxBytes) continue;
		entry.frames.delete(entry.id);
		if (entry.event?.hasFrame) {
			entry.events.put({ ...entry.event, hasFrame: false });
		}
	}
}

/** Every frame's id and byte size; a stored Blob's size is known without reading its bytes. */
function frameSizes(
	frames: IDBObjectStore,
): Promise<{ id: number; bytes: number }[]> {
	return new Promise((resolve, reject) => {
		const sizes: { id: number; bytes: number }[] = [];
		const cursor = frames.openCursor();
		cursor.onsuccess = () => {
			const c = cursor.result;
			if (!c) {
				resolve(sizes);
				return;
			}
			sizes.push({ id: c.primaryKey as number, bytes: (c.value as Blob).size });
			c.continue();
		};
		cursor.onerror = () => reject(cursor.error);
	});
}

function request<T>(req: IDBRequest<T>): Promise<T> {
	return new Promise((resolve, reject) => {
		req.onsuccess = () => resolve(req.result);
		req.onerror = () => reject(req.error);
	});
}
