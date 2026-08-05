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
const DB_NAME = "vod-parser";
const DB_VERSION = 4;

export const EVENTS_STORE = "events";
export const FRAMES_STORE = "frames";
export const VODS_STORE = "vods";
export const VOD_EVENTS_STORE = "vod-events";
export const VOD_FRAMES_STORE = "vod-frames";
export const INSPECT_FRAMES_STORE = "inspect-frames";

/**
 * Move a store's embedded `frame` blobs into a keyed frame store (v3
 * migration), stamping `hasFrame` on the source records.
 */
function extractFrames(source: IDBObjectStore, frames: IDBObjectStore): void {
	const req = source.openCursor();
	req.onsuccess = () => {
		const cursor = req.result;
		if (!cursor) return;
		const record = cursor.value as { frame?: Blob; hasFrame?: boolean };
		if (record.frame) {
			frames.put(record.frame, cursor.primaryKey);
			record.hasFrame = true;
			delete record.frame;
			cursor.update(record);
		}
		cursor.continue();
	};
}

// xxx: get rid of migrate before we go live with this
/**
 * Versioned migrations: each `oldVersion < N` block upgrades a database from
 * below version N and runs exactly once per database. Any schema change —
 * including one to an EXISTING store (new index, moved field) — must be a new
 * block plus a DB_VERSION bump, never an edit to an old block: databases that
 * already ran the old block would silently skip the change otherwise.
 */
function migrate(
	database: IDBDatabase,
	transaction: IDBTransaction,
	oldVersion: number,
): void {
	if (oldVersion < 2) {
		// v1/v2 era stores; contains() guards absorb the pre-versioned scheme,
		// where every creation was unconditionally contains()-gated
		if (!database.objectStoreNames.contains(EVENTS_STORE)) {
			const store = database.createObjectStore(EVENTS_STORE, {
				keyPath: "id",
				autoIncrement: true,
			});
			store.createIndex("t", "t");
			store.createIndex("detectedAt", "detectedAt");
		}
		if (!database.objectStoreNames.contains(VODS_STORE)) {
			database.createObjectStore(VODS_STORE, { keyPath: "name" });
		}
		if (!database.objectStoreNames.contains(VOD_EVENTS_STORE)) {
			const store = database.createObjectStore(VOD_EVENTS_STORE, {
				keyPath: "id",
				autoIncrement: true,
			});
			store.createIndex("vod", "vod");
		}
	}
	if (oldVersion < 3) {
		// frame blobs move out of the event records into keyed frame stores
		const frames = database.createObjectStore(FRAMES_STORE);
		const vodFrames = database.createObjectStore(VOD_FRAMES_STORE);
		extractFrames(transaction.objectStore(EVENTS_STORE), frames);
		extractFrames(transaction.objectStore(VOD_EVENTS_STORE), vodFrames);
	}
	if (oldVersion < 4) {
		database.createObjectStore(INSPECT_FRAMES_STORE);
	}
}

function openDb(): Promise<IDBDatabase> {
	return new Promise((resolve, reject) => {
		const req = indexedDB.open(DB_NAME, DB_VERSION);
		req.onupgradeneeded = (event) => {
			migrate(req.result, req.transaction!, event.oldVersion);
		};
		req.onsuccess = () => resolve(req.result);
		req.onerror = () => reject(req.error);
	});
}

let dbPromise: Promise<IDBDatabase> | null = null;
export function db(): Promise<IDBDatabase> {
	dbPromise ??= openDb();
	return dbPromise;
}

/** Single-request convenience wrapper over one object store. */
export function tx<T>(
	storeName: string,
	mode: IDBTransactionMode,
	run: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
	return db().then(
		(database) =>
			new Promise<T>((resolve, reject) => {
				const transaction = database.transaction(storeName, mode);
				const req = run(transaction.objectStore(storeName));
				req.onsuccess = () => resolve(req.result);
				req.onerror = () => reject(req.error);
			}),
	);
}
