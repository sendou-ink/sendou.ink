/**
 * IndexedDB event store: one `events` object store, keyed by auto id,
 * indexed by timestamp. A small thumbnail of the detection frame is kept
 * per event for the feed; the full-res analyzed PNG lives in the separate
 * `frames` store under the same id (loaded on demand via loadEventFrame),
 * so listing the feed never deserializes megabytes of blobs. The store is
 * capped: saving past MAX_EVENTS evicts the oldest events and their frames.
 */
import type { IngestedMatchLink } from "~/features/scanner-ingest/scanner-ingest-schemas";
import type { DetectedEvent } from "../core/detectors/types";
import { db, EVENTS_STORE, FRAMES_STORE, tx } from "./db";

/** Oldest events (and their frames) are evicted past this count. */
const MAX_EVENTS = 1000;

/** Where an event stands with sendou.ink /ingest; absent = never attempted. */
export interface SendStatus {
	/**
	 * "unlinked": sendou.ink stored the match but its game is not reported
	 * yet, so it has no scoreboard to attach to — resent on a backoff.
	 */
	state: "queued" | "sending" | "sent" | "unlinked" | "failed";
	/** wall-clock time of the last state change */
	at: number;
	/** failure detail, set when state is "failed" */
	error?: string;
	/** the sendou.ink match /ingest linked the sent match to, when it reported one */
	link?: IngestedMatchLink;
	/** how many times the match came back unlinked, set while state is "unlinked" */
	attempts?: number;
}

export interface StoredEvent {
	id?: number;
	type: string;
	t: number;
	/** wall-clock time of detection */
	detectedAt: number;
	confidence: number;
	data: unknown;
	/** small JPEG data URL of the source frame */
	thumbnail?: string;
	/** whether a full-res frame exists in the `frames` store under this id */
	hasFrame?: boolean;
	send?: SendStatus;
}

/**
 * Persist a detection; resolves to its store id. `reuseId` overwrites that
 * existing row (and its frame) instead of adding a new one, so an event a
 * better read replaces keeps a stable id.
 */
export async function saveEvent(
	event: DetectedEvent,
	thumbnail?: string,
	frame?: Blob,
	reuseId?: number,
): Promise<number> {
	const record: StoredEvent = {
		...(reuseId !== undefined ? { id: reuseId } : null),
		type: event.type,
		t: event.t,
		detectedAt: Date.now(),
		confidence: event.confidence,
		data: event.data,
		thumbnail,
		hasFrame: frame !== undefined,
	};
	const database = await db();
	return new Promise<number>((resolve, reject) => {
		const transaction = database.transaction(
			[EVENTS_STORE, FRAMES_STORE],
			"readwrite",
		);
		const events = transaction.objectStore(EVENTS_STORE);
		const frames = transaction.objectStore(FRAMES_STORE);
		let id: number;
		const add = events.put(record) as IDBRequest<number>;
		add.onsuccess = () => {
			id = add.result;
			if (frame) frames.put(frame, id);
			else if (reuseId !== undefined) frames.delete(id);
			evictOldest(events, frames);
		};
		transaction.oncomplete = () => resolve(id);
		transaction.onerror = () => reject(transaction.error);
	});
}

/** Delete records (and frames) beyond MAX_EVENTS, oldest ids first. */
function evictOldest(events: IDBObjectStore, frames: IDBObjectStore): void {
	const count = events.count();
	count.onsuccess = () => {
		let excess = count.result - MAX_EVENTS;
		if (excess <= 0) return;
		const cursor = events.openCursor(); // ascending id = oldest first
		cursor.onsuccess = () => {
			const c = cursor.result;
			if (!c || excess <= 0) return;
			frames.delete(c.primaryKey);
			c.delete();
			excess--;
			if (excess > 0) c.continue();
		};
	};
}

/** Sets (or clears) the send status of the given events in one transaction. */
export async function updateEventsSend(
	ids: number[],
	send: SendStatus | undefined,
): Promise<void> {
	const database = await db();
	return new Promise<void>((resolve, reject) => {
		const transaction = database.transaction(EVENTS_STORE, "readwrite");
		const events = transaction.objectStore(EVENTS_STORE);
		for (const id of ids) {
			const get = events.get(id) as IDBRequest<StoredEvent | undefined>;
			get.onsuccess = () => {
				const record = get.result;
				if (!record) return; // evicted meanwhile
				if (send) record.send = send;
				else delete record.send;
				events.put(record);
			};
		}
		transaction.oncomplete = () => resolve();
		transaction.onerror = () => reject(transaction.error);
	});
}

/** Deletes the given events and their frames in one transaction. */
export async function deleteEvents(ids: number[]): Promise<void> {
	const database = await db();
	return new Promise<void>((resolve, reject) => {
		const transaction = database.transaction(
			[EVENTS_STORE, FRAMES_STORE],
			"readwrite",
		);
		const events = transaction.objectStore(EVENTS_STORE);
		const frames = transaction.objectStore(FRAMES_STORE);
		for (const id of ids) {
			events.delete(id);
			frames.delete(id);
		}
		transaction.oncomplete = () => resolve();
		transaction.onerror = () => reject(transaction.error);
	});
}

export function listEvents(): Promise<StoredEvent[]> {
	return tx(
		EVENTS_STORE,
		"readonly",
		(store) => store.getAll() as IDBRequest<StoredEvent[]>,
	);
}

/** The event's full-res analyzed PNG, or undefined when none was stored. */
export function loadEventFrame(id: number): Promise<Blob | undefined> {
	return tx(
		FRAMES_STORE,
		"readonly",
		(store) => store.get(id) as IDBRequest<Blob | undefined>,
	);
}

export async function clearEvents(): Promise<void> {
	const database = await db();
	return new Promise<void>((resolve, reject) => {
		const transaction = database.transaction(
			[EVENTS_STORE, FRAMES_STORE],
			"readwrite",
		);
		transaction.objectStore(EVENTS_STORE).clear();
		transaction.objectStore(FRAMES_STORE).clear();
		transaction.oncomplete = () => resolve();
		transaction.onerror = () => reject(transaction.error);
	});
}
