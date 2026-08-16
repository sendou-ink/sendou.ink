/**
 * Shared IndexedDB handle for the app's stores:
 *  - `events`: live-tab detections, keyed by auto id (see events.ts)
 *  - `frames`: the live events' full-res analyzed PNGs, keyed by event id —
 *    kept out of `events` so listing the feed never deserializes them
 *  - `vods`: one summary record per fully scanned VoD, keyed by file name
 *  - `vod-events`: the detections of each saved VoD, indexed by VoD name
 *  - `vod-frames`: the vod-events' PNGs, keyed by vod-event id
 *  - `inspect-frames`: one-shot Inspect handoffs into a new screenshot tab,
 *    keyed by handoff key (see inspect.ts)
 */
const DB_NAME = "scanner";
const DB_VERSION = 1;

export const EVENTS_STORE = "events";
export const FRAMES_STORE = "frames";
export const VODS_STORE = "vods";
export const VOD_EVENTS_STORE = "vod-events";
export const VOD_FRAMES_STORE = "vod-frames";
export const INSPECT_FRAMES_STORE = "inspect-frames";

/**
 * Recreates the schema from scratch, dropping any stores already there, so a
 * DB_VERSION bump is always a clean slate at the cost of wiping scanner data.
 */
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
