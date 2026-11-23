/**
 * The broadcast pages' IndexedDB. Stores:
 *  - `music-tracks`: the dashboard's music library, one record per track (music-library.ts)
 *  - `music-files`: the library's audio files, keyed by their track id
 *  - `received-clips`: what an OBS source keeps of the files sent to it over page loads (clip-cache.ts)
 */
const DB_NAME = "broadcast";
const DB_VERSION = 1;

export const MUSIC_TRACKS_STORE = "music-tracks";
export const MUSIC_FILES_STORE = "music-files";
export const RECEIVED_CLIPS_STORE = "received-clips";

function upgrade(database: IDBDatabase) {
	const has = (name: string) => database.objectStoreNames.contains(name);

	if (!has(MUSIC_TRACKS_STORE)) {
		database.createObjectStore(MUSIC_TRACKS_STORE, { keyPath: "id" });
	}
	if (!has(MUSIC_FILES_STORE)) database.createObjectStore(MUSIC_FILES_STORE);
	if (!has(RECEIVED_CLIPS_STORE)) {
		database.createObjectStore(RECEIVED_CLIPS_STORE, { keyPath: "id" });
	}
}

let dbPromise: Promise<IDBDatabase> | null = null;
function db(): Promise<IDBDatabase> {
	dbPromise ??= new Promise<IDBDatabase>((resolve, reject) => {
		const opening = indexedDB.open(DB_NAME, DB_VERSION);
		opening.onupgradeneeded = () => upgrade(opening.result);
		opening.onsuccess = () => resolve(opening.result);
		opening.onerror = () => reject(opening.error);
	}).then(
		(database) => {
			// another tab upgrading gets the database, the next call here opens it again
			database.onversionchange = () => {
				database.close();
				dbPromise = null;
			};
			return database;
		},
		(error) => {
			dbPromise = null;
			throw error;
		},
	);

	return dbPromise;
}

/** One request to one store. */
export async function request<T>(
	storeName: string,
	mode: IDBTransactionMode,
	run: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
	const database = await db();

	return new Promise<T>((resolve, reject) => {
		const req = run(
			database.transaction(storeName, mode).objectStore(storeName),
		);
		req.onsuccess = () => resolve(req.result);
		req.onerror = () => reject(req.error);
	});
}

/** Runs `run` in one readwrite transaction over the stores, resolving once it commits. */
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
