/**
 * Shared IndexedDB handle. Stores:
 *  - `events`: live-tab detections, keyed by auto id (events.ts)
 *  - `frames`: their full-res analyzed PNGs by event id, kept apart so listing the feed never deserializes them
 *  - `vods`: one summary per fully scanned VoD, keyed by file name
 *  - `vod-events`: each saved VoD's detections, indexed by VoD name
 *  - `vod-frames`: their PNGs, keyed by vod-event id
 *  - `inspect-frames`: one-shot Inspect handoffs into a new screenshot tab (inspect.ts)
 */
const DB_NAME = "scanner";
const DB_VERSION = 1;

export const EVENTS_STORE = "events";
export const FRAMES_STORE = "frames";
export const VODS_STORE = "vods";
export const VOD_EVENTS_STORE = "vod-events";
export const VOD_FRAMES_STORE = "vod-frames";
export const INSPECT_FRAMES_STORE = "inspect-frames";

/** Recreates the schema from scratch, so a DB_VERSION bump is a clean slate that wipes scanner data. */
function createStores(database: IDBDatabase): void {
	for (const name of Array.from(database.objectStoreNames)) {
		database.deleteObjectStore(name);
	}

	const events = database.createObjectStore(EVENTS_STORE, {
		keyPath: "id",
		autoIncrement: true,
	});
	events.createIndex("t", "t");
	events.createIndex("detectedAt", "detectedAt");

	database.createObjectStore(VODS_STORE, { keyPath: "name" });

	const vodEvents = database.createObjectStore(VOD_EVENTS_STORE, {
		keyPath: "id",
		autoIncrement: true,
	});
	vodEvents.createIndex("vod", "vod");

	database.createObjectStore(FRAMES_STORE);
	database.createObjectStore(VOD_FRAMES_STORE);
	database.createObjectStore(INSPECT_FRAMES_STORE);
}

function openDb(): Promise<IDBDatabase> {
	return new Promise((resolve, reject) => {
		const req = indexedDB.open(DB_NAME, DB_VERSION);
		req.onupgradeneeded = () => createStores(req.result);
		req.onblocked = () => {
			// biome-ignore lint/suspicious/noConsole: the only diagnostic channel for a hang caused by other tabs
			console.warn(
				"scanner database upgrade is blocked — close or reload other sendou.ink tabs",
			);
		};
		req.onsuccess = () => resolve(req.result);
		req.onerror = () => reject(req.error);
	});
}

let dbPromise: Promise<IDBDatabase> | null = null;
export function db(): Promise<IDBDatabase> {
	dbPromise ??= openDb().then((database) => {
		// when another tab needs to upgrade, release the connection instead of
		// blocking that tab forever; the next call here reconnects fresh
		database.onversionchange = () => {
			database.close();
			dbPromise = null;
		};
		return database;
	});
	return dbPromise;
}

/** Single-request convenience wrapper over one object store. */
export async function tx<T>(
	storeName: string,
	mode: IDBTransactionMode,
	run: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
	const database = await db();
	return new Promise<T>((resolve, reject) => {
		const transaction = database.transaction(storeName, mode);
		const req = run(transaction.objectStore(storeName));
		req.onsuccess = () => resolve(req.result);
		req.onerror = () => reject(req.error);
	});
}
