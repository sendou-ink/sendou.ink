/**
 * Shared IndexedDB handle. Stores:
 *  - `events`: live detections, keyed by auto id (events.ts)
 *  - `frames`: their full-res analyzed PNGs by event id, kept apart so listing the feed never deserializes them
 *  - `compacted-matches`: older live sessions' games, frozen as built, indexed by session (compacted-matches.ts)
 *  - `vods`: one summary per scanned VoD, keyed by file name (vods.ts)
 *  - `vod-events`: each saved VoD's detections, indexed by VoD name
 *  - `vod-frames`: their PNGs, keyed by vod-event id
 *  - `clips`: clip records by auto id, indexed by bucket (clips.ts)
 *  - `clip-blobs`: the clips' MP4s, keyed by clip id
 *  - `inspect-frames`: one-shot Inspect handoffs into a new debug tab (inspect.ts)
 */
const DB_NAME = "scanner";
const DB_VERSION = 3;

export const EVENTS_STORE = "events";
export const FRAMES_STORE = "frames";
export const COMPACTED_MATCHES_STORE = "compacted-matches";
export const VODS_STORE = "vods";
export const VOD_EVENTS_STORE = "vod-events";
export const VOD_FRAMES_STORE = "vod-frames";
export const CLIPS_STORE = "clips";
export const CLIP_BLOBS_STORE = "clip-blobs";
export const INSPECT_FRAMES_STORE = "inspect-frames";

/**
 * Adds the stores a DB_VERSION bump introduced, keeping the existing ones and
 * their data. v2 added the clip stores and moved live event times onto the
 * wall clock, so a v1 database's live events (stamped on the page clock)
 * are dropped; v3 added the compacted matches. Changing an existing store's
 * shape needs a real migration here.
 */
function upgrade(database: IDBDatabase, oldVersion: number): void {
	const has = (name: string) => database.objectStoreNames.contains(name);

	if (oldVersion < 2 && has(EVENTS_STORE)) {
		database.deleteObjectStore(EVENTS_STORE);
		database.deleteObjectStore(FRAMES_STORE);
	}

	if (!has(EVENTS_STORE)) {
		const events = database.createObjectStore(EVENTS_STORE, {
			keyPath: "id",
			autoIncrement: true,
		});
		events.createIndex("t", "t");
		events.createIndex("detectedAt", "detectedAt");
	}

	if (!has(COMPACTED_MATCHES_STORE)) {
		const compacted = database.createObjectStore(COMPACTED_MATCHES_STORE, {
			keyPath: "id",
		});
		compacted.createIndex("sessionKey", "session.key");
	}

	if (!has(VODS_STORE)) {
		database.createObjectStore(VODS_STORE, { keyPath: "name" });
	}

	if (!has(VOD_EVENTS_STORE)) {
		const vodEvents = database.createObjectStore(VOD_EVENTS_STORE, {
			keyPath: "id",
			autoIncrement: true,
		});
		vodEvents.createIndex("vod", "vod");
	}

	if (!has(CLIPS_STORE)) {
		const clips = database.createObjectStore(CLIPS_STORE, {
			keyPath: "id",
			autoIncrement: true,
		});
		clips.createIndex("bucket", "bucket");
	}

	for (const name of [
		FRAMES_STORE,
		VOD_FRAMES_STORE,
		CLIP_BLOBS_STORE,
		INSPECT_FRAMES_STORE,
	]) {
		if (!has(name)) database.createObjectStore(name);
	}
}

function openDb(): Promise<IDBDatabase> {
	return new Promise((resolve, reject) => {
		const req = indexedDB.open(DB_NAME, DB_VERSION);
		req.onupgradeneeded = (event) => upgrade(req.result, event.oldVersion);
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
function db(): Promise<IDBDatabase> {
	dbPromise ??= openDb().then(
		(database) => {
			// when another tab needs to upgrade, release the connection instead of
			// blocking that tab forever; the next call here reconnects fresh
			database.onversionchange = () => {
				database.close();
				dbPromise = null;
			};
			return database;
		},
		(error) => {
			// a failed open (private mode, quota) must not be cached forever
			dbPromise = null;
			throw error;
		},
	);
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

/** Runs `run` inside one readwrite transaction over `storeNames`, resolving on commit. */
export async function readwrite(
	storeNames: string[],
	run: (transaction: IDBTransaction) => void,
): Promise<void> {
	const database = await db();
	return new Promise<void>((resolve, reject) => {
		const transaction = database.transaction(storeNames, "readwrite");
		run(transaction);
		transaction.oncomplete = () => resolve();
		transaction.onerror = () => reject(transaction.error);
		transaction.onabort = () => reject(transaction.error);
	});
}
