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

const ALL_STORES = [
	EVENTS_STORE,
	FRAMES_STORE,
	VODS_STORE,
	VOD_EVENTS_STORE,
	VOD_FRAMES_STORE,
	INSPECT_FRAMES_STORE,
];

// xxx: get rid of migrate before we go live with this
/**
 * Brings any database — fresh, older-versioned or drifted (a dev database
 * whose version was bumped past DB_VERSION without these stores) — to the
 * current schema. Store creation is existence-guarded rather than
 * version-gated so a reopen at version+1 (see openDb) can heal drift; only
 * data moves stay keyed on the version they shipped in.
 */
function migrate(
	database: IDBDatabase,
	transaction: IDBTransaction,
	oldVersion: number,
): void {
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
	if (!database.objectStoreNames.contains(FRAMES_STORE)) {
		database.createObjectStore(FRAMES_STORE);
	}
	if (!database.objectStoreNames.contains(VOD_FRAMES_STORE)) {
		database.createObjectStore(VOD_FRAMES_STORE);
	}
	if (oldVersion < 3) {
		// v1/v2 era kept the frame blobs embedded in the event records
		extractFrames(
			transaction.objectStore(EVENTS_STORE),
			transaction.objectStore(FRAMES_STORE),
		);
		extractFrames(
			transaction.objectStore(VOD_EVENTS_STORE),
			transaction.objectStore(VOD_FRAMES_STORE),
		);
	}
	if (!database.objectStoreNames.contains(INSPECT_FRAMES_STORE)) {
		database.createObjectStore(INSPECT_FRAMES_STORE);
	}
}

function openAt(version?: number): Promise<IDBDatabase> {
	return new Promise((resolve, reject) => {
		const req =
			version === undefined
				? indexedDB.open(DB_NAME)
				: indexedDB.open(DB_NAME, version);
		req.onupgradeneeded = (event) => {
			migrate(req.result, req.transaction!, event.oldVersion);
		};
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

/**
 * Opens at whatever version exists, then upgrades when the schema is behind —
 * either an honest old version or a drifted database sitting at/above
 * DB_VERSION without all stores, which a plain open(DB_VERSION) would
 * silently accept (or reject with VersionError).
 */
async function openDb(): Promise<IDBDatabase> {
	let database = await openAt();
	const missingStore = ALL_STORES.some(
		(name) => !database.objectStoreNames.contains(name),
	);
	if (database.version < DB_VERSION || missingStore) {
		const nextVersion = Math.max(DB_VERSION, database.version + 1);
		database.close();
		database = await openAt(nextVersion);
	}
	return database;
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
